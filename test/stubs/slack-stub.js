'use strict';

var events = require('events');
var sinon = require('sinon');
var ChannelStub = require('./channel-stub');

class SlackStub extends events.EventEmitter {
  constructor() {
    super();
    this.returnWrongStubInfo = false;
  }

  getChannelStub() {
    if (this.returnWrongStubInfo) return null;
    return new ChannelStub();
  }

  getUserByID() {
    if (this.returnWrongStubInfo) {
      return {
        name: 'nottheuser'
      };
    }

    return {
      name: 'testuser'
    };
  }

  resetStub() {
    this.returnWrongStubInfo = false;
  }
}

SlackStub.prototype.getChannelByID = SlackStub.prototype.getChannelStub;
SlackStub.prototype.getChannelGroupOrDMByName = SlackStub.prototype.getChannelStub;
SlackStub.prototype.getChannelGroupOrDMByID = SlackStub.prototype.getChannelStub;
SlackStub.prototype.login = sinon.stub();

module.exports = SlackStub;
