const dgram = require('dgram');
const Connection = require('./connection.js');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const debug = util.debuglog('tftp');

function TFTPServer (socketType) {
	this.socket = dgram.createSocket(socketType);
	this.routes = [];
	this.connections = {};
	this.ingress = new EventEmitter();
	this.outgress = new EventEmitter();

	// Setup connection factory
	this.connectionFactory = Connection(this.ingress, this.outgress);

	// Install listener to incoming packets
	this.socket.on('message', (msg, rinfo) => {
		const clientKey = `${rinfo.address}_${rinfo.port}`;
		debug('=>', clientKey, msg);
		if (this.connections[clientKey]) {
			// Connection already has been established
			this.ingress.emit(clientKey, msg);
		} else {
			// First packet from client:
			// Listen to outgress packets
			const onOutgress = (msg) => {
				debug('<=', clientKey, msg);
				this.socket.send(msg, 0, msg.length, rinfo.port, rinfo.address);
			};
			this.outgress.on(clientKey, onOutgress);
			// Create new connection FSM
			debug('+ ', clientKey);
			this.connections[clientKey] = this.connectionFactory.run(
				Object.assign({
					request: msg,
					clientKey: clientKey,
					routes: this.routes
				}, rinfo),
				() => {
					// FSM has been destroy
					this.outgress.removeListener(clientKey, onOutgress);
					delete this.connections[clientKey];
					debug('- ', clientKey);
				}
			);
		}
	});
}

TFTPServer.prototype.bind = function (options) {
	this.socket.bind(options);
};

TFTPServer.prototype.register = function (filter, handler) {
	if (filter instanceof Function) {
		handler = filter;
		filter = undefined;
	}
	return this.routes.push({ filter, handler }) - 1;
};

TFTPServer.prototype.unregister = function (handle) {
	this.routes[handle] = undefined;
};

TFTPServer.prototype.destroy = function (cb) {
	// Finalise all connection FSMs
	Object.keys(this.connections).forEach((clientKey) => {
		this.connections[clientKey].next(null);
	});

	// Close socket
	this.socket.close(cb);
};

module.exports = TFTPServer;
