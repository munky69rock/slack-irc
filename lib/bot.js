'use strict';

const _ = require('lodash');
const irc = require('irc');
const logger = require('winston');
const Slack = require('slack-client');
const errors = require('./errors');
const validateChannelMapping = require('./validators').validateChannelMapping;
const emojis = require('./emoji');
const strings = require('./strings');

const ALLOWED_SUBTYPES = ['me_message'];
const REQUIRED_FIELDS = ['server', 'nickname', 'channelMapping', 'token'];

/**
 * An IRC bot, works as a middleman for all communication
 * @param {object} options - server, nickname, channelMapping, outgoingToken, incomingURL
 */
class Bot {
  constructor(options) {
    REQUIRED_FIELDS.forEach(function(field) {
      if (!options[field]) {
        throw new errors.ConfigurationError(`Missing configuration field ${field}`);
      }
    });

    validateChannelMapping(options.channelMapping);

    this.slack = new Slack(options.token);

    this.server = options.server;
    this.nickname = options.nickname;
    this.ircOptions = options.ircOptions;
    this.commandCharacters = options.commandCharacters || [];
    this.channels = _.values(options.channelMapping);

    this.channelMapping = {};

    // Remove channel passwords from the mapping and lowercase IRC channel names
    _.forOwn(options.channelMapping, function(ircChan, slackChan) {
      this.channelMapping[slackChan] = ircChan.split(' ')[0].toLowerCase();
    }, this);

    this.invertedMapping = _.invert(this.channelMapping);

    this.autoSendCommands = options.autoSendCommands || [];
  }

  connect() {
    logger.debug('Connecting to IRC and Slack');
    this.slack.login();

    var ircOptions = _.assign({
      userName: this.nickname,
      realName: this.nickname,
      channels: this.channels,
      floodProtection: true,
      floodProtectionDelay: 500
    }, this.ircOptions);

    this.ircClient = new irc.Client(this.server, this.nickname, ircOptions);
    this.attachListeners();
  }

  attachListeners() {
    this.slack.on('open', function() {
      logger.debug('Connected to Slack');
    });

    this.ircClient.on('registered', (message) => {
      logger.debug('Registered event: ', message);
      this.autoSendCommands.forEach(function(element) {
        this.ircClient.send.apply(this.ircClient, element);
      }, this);
    });

    this.ircClient.on('error', function(error) {
      logger.error('Received error event from IRC', error);
    });

    this.slack.on('error', function(error) {
      logger.error('Received error event from Slack', error);
    });

    this.slack.on('message', (message) => {
      // Ignore bot messages and people leaving/joining
      if (message.type === 'message' &&
          (!message.subtype || ALLOWED_SUBTYPES.indexOf(message.subtype) > -1)) {
        this.sendToIRC(message);
      }
    });

    this.ircClient.on('message', this.sendToSlack.bind(this));

    this.ircClient.on('notice', (author, to, text) => {
      this.sendToSlack(author, to, strings.weaken(text));
    });

    this.ircClient.on('action', (author, to, text) => {
      this.sendToSlack(author, to, strings.emphasize(text));
    });

    this.ircClient.on('invite', (channel, from) => {
      logger.debug('Received invite:', channel, from);
      if (!this.invertedMapping[channel]) {
        logger.debug('Channel not found in config, not joining:', channel);
      } else {
        this.ircClient.join(channel);
        logger.debug('Joining channel:', channel);
      }
    });
  }

  parseText(text) {
    return text
        .replace(/\n|\r\n|\r/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<!channel>/g, '@channel')
        .replace(/<!group>/g, '@group')
        .replace(/<!everyone>/g, '@everyone')
        .replace(/<#(C\w+)\|?(\w+)?>/g, (match, channelId, readable) => {
          return readable || '#' + this.slack.getChannelByID(channelId).name;
        })
        .replace(/<@(U\w+)\|?(\w+)?>/g, (match, userId, readable) => {
          return readable || '@' + this.slack.getUserByID(userId).name;
        })
        .replace(/<(?!!)(\S+)>/g, function(match, link) {
          return link;
        })
        .replace(/<!(\w+)\|?(\w+)?>/g, function(match, command, label) {
          if (label) {
            return `<${label}>`;
          }

          return `<${command}>`;
        })
        .replace(/:(\w+):/g, function(match, emoji) {
          if (emoji in emojis) {
            return emojis[emoji];
          }

          return match;
        });
  }

  isCommandMessage(message) {
    return this.commandCharacters.indexOf(message[0]) !== -1;
  }

  sendToIRC(message) {
    var channel = this.slack.getChannelGroupOrDMByID(message.channel);
    if (!channel) {
      logger.info('Received message from a channel the bot isn\'t in:',
          message.channel);
      return;
    }

    var channelName = channel.is_channel ? '#' + channel.name : channel.name;
    var ircChannel = this.channelMapping[channelName];

    logger.debug('Channel Mapping', channelName, this.channelMapping[channelName]);
    if (ircChannel) {
      var user = this.slack.getUserByID(message.user);
      var text = this.parseText(message.getBody());

      var notice = strings.isWeakened(text);
      if (notice) {
        text = strings.normalize(text);
      }

      if (this.isCommandMessage(text)) {
        var prelude = `Command sent from Slack by ${user.name}:`;
        this.ircClient.say(ircChannel, prelude);
      } else if (!message.subtype) {
        text = `<${strings.insertSpace(user.name)}> ${text}`;
      } else if (message.subtype === 'me_message') {
        text = `Action: ${user.name} ${text}`;
      }

      logger.debug('Sending message to IRC', channelName, text);
      if (notice) {
        this.ircClient.notice(ircChannel, text);
      } else {
        this.ircClient.say(ircChannel, text);
      }
    }
  }

  sendToSlack(author, channel, text) {
    var slackChannelName = this.invertedMapping[channel.toLowerCase()];
    if (slackChannelName) {
      var slackChannel = this.slack.getChannelGroupOrDMByName(slackChannelName);

      if (!slackChannel) {
        logger.info('Tried to send a message to a channel the bot isn\'t in: ',
            slackChannelName);
        return;
      }

      var message = {
        text: strings.stripColorCode(text),
        username: author,
        parse: 'full',
        icon_url: `http://api.adorable.io/avatars/48/${author}.png`
      };
      logger.debug('Sending message to Slack', message, channel, '->', slackChannelName);
      slackChannel.postMessage(message);
    }
  }
}

module.exports = Bot;
