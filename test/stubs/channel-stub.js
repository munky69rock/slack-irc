'use strict';

var events = require('events');
var sinon = require('sinon');

class ChannelStub extends events.EventEmitter {
  constructor() {
    super();
    this.name = 'slack';
    this.is_channel = true;
  }
}

ChannelStub.prototype.postMessage = sinon.stub();

module.exports = ChannelStub;
