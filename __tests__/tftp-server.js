jest.mock('dgram');
const dgram = require('dgram');

jest.mock('../connection.js');
const connection = require('../connection.js');

const TFTPServer = require('../tftp-server.js');

test('create new udp6 socket', () => {
	const t = new TFTPServer('udp6');
	expect(dgram.createSocket.mock.calls[0][0]).toEqual('udp6');
	expect(t.socket).toBeInstanceOf(dgram.Socket);
});

test('create new udp4 socket', () => {
	const t = new TFTPServer('udp4');
	expect(dgram.createSocket.mock.calls[0][0]).toEqual('udp4');
	expect(t.socket).toBeInstanceOf(dgram.Socket);
});

test('register new route with filter', () => {
	const t = new TFTPServer();
	const filter = new RegExp();
	const handler = () => {};
	const handle = t.register(filter, handler);
	expect(t.routes[0].filter).toBe(filter);
	expect(t.routes[0].handler).toBe(handler);
	expect(handle).toBe(0);
});

test('register new route without filter', () => {
	const t = new TFTPServer();
	const handler = () => {};
	t.register(handler);
	expect(t.routes[0].filter).toBeUndefined();
	expect(t.routes[0].handler).toBe(handler);
});

test('unregister route', () => {
	const t = new TFTPServer();
	const handler = () => {};
	const handle = t.register(handler);
	expect(t.routes[0].filter).toBeUndefined();
	expect(t.routes[0].handler).toBe(handler);
	t.unregister(handle);
	expect(t.routes[0]).toBeUndefined();
	expect(t.routes.length).toBe(1);
});

test('bind socket', () => {
	const t = new TFTPServer();
	const opts = {};
	t.bind(opts);
	expect(dgram.Socket.prototype.bind.mock.calls[0][0]).toBe(opts);
});

test('call connection factory', () => {
	const t = new TFTPServer();
	expect(connection.mock.calls[0][0]).toBe(t.ingress, t.outgress);
});

test('create new connection on ingress packet', () => {
	const t = new TFTPServer();
	const msg = Buffer.alloc(0);
	const rinfo = {
		address: '1.2.3.4',
		port: 4567
	};
	const clientKey = `${rinfo.address}_${rinfo.port}`;
	t.socket.emit('message', msg, rinfo);
	expect(connection.run.mock.calls[0][0]).toMatchObject(Object.assign({
		request: msg,
		clientKey: clientKey,
		routes: t.routes
	}, rinfo));
	expect(t.connections[clientKey]).toBeDefined();
});

test('send packet to bus if connection fsm exists', (done) => {
	const t = new TFTPServer();
	const msg = Buffer.alloc(0);
	const rinfo = {
		address: '1.2.3.4',
		port: 4567
	};
	t.connections[`${rinfo.address}_${rinfo.port}`] = true;
	t.ingress.on(`${rinfo.address}_${rinfo.port}`, (m) => {
		try {
			expect(m).toBe(msg);
			done();
		} catch (e) { done(e); }
	});
	t.socket.emit('message', msg, rinfo);
});

test('remove handle if FSM terminates', () => {
	const t = new TFTPServer();
	const rinfo = {
		address: '1.2.3.4',
		port: 4567
	};
	const clientKey = `${rinfo.address}_${rinfo.port}`;
	expect(t.outgress.listenerCount(clientKey)).toBe(0);
	t.socket.emit('message', Buffer.alloc(0), rinfo);
	expect(t.connections[clientKey]).toBeDefined();
	expect(t.outgress.listenerCount(clientKey)).toBe(1);
	connection.run.mock.calls[0][1]();
	expect(t.connections[clientKey]).toBeUndefined();
	expect(t.outgress.listenerCount(clientKey)).toBe(0);
});

test('send packets on event', () => {
	const t = new TFTPServer();
	const rinfo = {
		address: '1.2.3.4',
		port: 4567
	};
	const clientKey = `${rinfo.address}_${rinfo.port}`;
	t.socket.emit('message', Buffer.alloc(0), rinfo);
	const msg = Buffer.alloc(2);
	t.outgress.emit(clientKey, msg);
	expect(dgram.Socket.prototype.send.mock.calls[0][0]).toBe(msg);
	expect(dgram.Socket.prototype.send.mock.calls[0][1]).toBe(0);
	expect(dgram.Socket.prototype.send.mock.calls[0][2]).toBe(msg.length);
	expect(dgram.Socket.prototype.send.mock.calls[0][3]).toBe(rinfo.port);
	expect(dgram.Socket.prototype.send.mock.calls[0][4]).toBe(rinfo.address);
});

test('kill all FSMs on destroy', () => {
	const t = new TFTPServer();
	const c = { next: jest.fn() };
	t.connections = { 'abc': c };
	t.destroy();
	expect(c.next.mock.calls[0][0]).toBe(null);
});

test('close socket', () => {
	const t = new TFTPServer();
	t.destroy();
	expect(dgram.Socket.prototype.close.mock.calls.length).toBe(1);
});
