'use strict';

var events = require('events');
var sinon = require('sinon');

class ClientStub extends events.EventEmitter {}

ClientStub.prototype.say = sinon.stub();

ClientStub.prototype.send = sinon.stub();

ClientStub.prototype.join = sinon.stub();

module.exports = ClientStub;
