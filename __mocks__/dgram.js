const EventEmitter = require('events').EventEmitter;
const util = require('util');

function Socket () {
	EventEmitter.call(this);
}
util.inherits(Socket, EventEmitter);
Socket.prototype.bind = jest.fn();
Socket.prototype.send = jest.fn();
Socket.prototype.close = jest.fn();

module.exports.Socket = Socket;
module.exports.createSocket = jest.fn(() => new Socket());
