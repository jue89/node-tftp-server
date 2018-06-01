const EventEmitter = require('events').EventEmitter;

jest.mock('edfsm');

const connection = require('../connection.js');

const RRQ = Buffer.from([0, 1]);
const NULL = Buffer.from([0]);

describe('init', () => {
	test('complain if request is not a read request', () => {
		const c = connection().testState('init', {
			request: Buffer.from([0, 4, 0, 3])
		});
		expect(c.next.mock.calls[0][0].message).toEqual('Illegal TFTP operation.');
	});

	test('read filename and mode', () => {
		const filename = 'testfile';
		const mode = 'octet';
		const ctx = {
			request: Buffer.concat([ RRQ, Buffer.from(filename), NULL, Buffer.from(mode), NULL ])
		};
		connection().testState('init', ctx);
		expect(ctx.filename).toEqual(filename);
		expect(ctx.mode).toEqual(mode);
	});

	test('make sure filename is given', () => {
		const ctx = {
			request: Buffer.concat([ RRQ, NULL, Buffer.from('octet'), NULL ])
		};
		const c = connection().testState('init', ctx);
		expect(c.next.mock.calls[0][0].message).toEqual('File not found.');
	});

	test('next state', () => {
		const ctx = {
			request: Buffer.concat([ RRQ, Buffer.from('testfile'), NULL, Buffer.from('OCTET'), NULL ])
		};
		const c = connection().testState('init', ctx);
		expect(c.next.mock.calls[0][0]).toEqual('getData');
	});
});

describe('getData', () => {
	test('return file not found if routes are empty', () => {
		const c = connection().testState('getData', { routes: [] });
		expect(c.next.mock.calls[0][0].message).toEqual('File not found.');
	});

	test('return file not found if not matching route has been found', () => {
		const routes = [ {
			filter: /nope/,
			handler: jest.fn()
		} ];
		const c = connection().testState('getData', { routes, filename: 'test' });
		expect(c.next.mock.calls[0][0].message).toEqual('File not found.');
	});

	test('run handler if route matches', () => {
		const routes = [ {
			filter: /nope/,
			handler: jest.fn()
		}, {
			filter: 'file',
			handler: jest.fn()
		}, {
			filter: /file/,
			handler: jest.fn()
		} ];
		const ctx = { routes, filename: 'file' };
		connection().testState('getData', ctx);
		expect(routes[0].handler.mock.calls.length).toBe(0);
		expect(routes[1].handler.mock.calls.length).toBe(1);
		expect(routes[2].handler.mock.calls.length).toBe(0);
		expect(routes[1].handler.mock.calls[0][0]).toBe(ctx);
	});

	test('run next handler if route skips', () => {
		const routes = [ {
			filter: /nope/,
			handler: jest.fn()
		}, {
			filter: /file/,
			handler: jest.fn()
		}, {
			filter: /file/,
			handler: jest.fn()
		} ];
		const ctx = { routes, filename: 'file' };
		connection().testState('getData', ctx);
		expect(routes[0].handler.mock.calls.length).toBe(0);
		expect(routes[1].handler.mock.calls.length).toBe(1);
		expect(routes[2].handler.mock.calls.length).toBe(0);
		routes[1].handler.mock.calls[0][2]();
		expect(routes[2].handler.mock.calls.length).toBe(1);
	});

	test('return error from route', () => {
		const routes = [ {
			filter: undefined,
			handler: jest.fn()
		}, {
			filter: undefined,
			handler: jest.fn()
		}];
		const ctx = { routes, filename: 'file' };
		const c = connection().testState('getData', ctx);
		const errMsg = 'Test message.';
		routes[0].handler.mock.calls[0][2](new Error(errMsg));
		expect(routes[1].handler.mock.calls.length).toBe(0);
		expect(c.next.mock.calls[0][0].message).toEqual(errMsg);
	});

	test('prepare Chunk if route returns data', () => {
		const routes = [ {
			handler: jest.fn()
		} ];
		const ctx = { routes, filename: 'file' };
		const c = connection().testState('getData', ctx);
		const res = Buffer.alloc(0);
		routes[0].handler.mock.calls[0][1](res);
		expect(c.next.mock.calls[0][0]).toEqual('prepareDataPacket');
		expect(ctx.data).toBe(res);
		expect(ctx.block).toBe(0);
		expect(ctx.blocksize).toBe(512);
	});

	test('ignore unregistered routes', () => {
		const routes = [
			undefined,
			{ handler: jest.fn() }
		];
		const ctx = { routes, filename: 'file' };
		connection().testState('getData', ctx);
		expect(routes[1].handler.mock.calls.length).toBe(1);
	});
});

describe('prepareDataPacket', () => {
	test('slice first chunk', () => {
		const ctx = {
			data: Buffer.concat([
				Buffer.alloc(512, 'a'),
				Buffer.alloc(1, 'b')
			]),
			block: 0,
			blocksize: 512
		};
		const c = connection().testState('prepareDataPacket', ctx);
		expect(ctx.packet.toString('hex')).toEqual(`00030001${'61'.repeat(512)}`);
		expect(ctx.block).toBe(1);
		expect(ctx.try).toBe(0);
		expect(c.next.mock.calls[0][0]).toEqual('sendDataPacket');
	});
	test('slice next chunk', () => {
		const ctx = {
			data: Buffer.concat([
				Buffer.alloc(512, 'a'),
				Buffer.alloc(1, 'b')
			]),
			block: 1,
			blocksize: 512
		};
		connection().testState('prepareDataPacket', ctx);
		expect(ctx.packet.toString('hex')).toEqual(`00030002${'62'.repeat(1)}`);
	});
});

describe('sendDataPacket', () => {
	test('give chunk on the line', (done) => {
		const ingress = new EventEmitter();
		const outgress = new EventEmitter();
		const ctx = {
			clientKey: 'test',
			packet: Buffer.alloc(1),
			try: 3
		};
		outgress.on(ctx.clientKey, (m) => {
			try {
				expect(m).toBe(ctx.packet);
				done();
			} catch (e) { done(e); }
		});
		const c = connection(ingress, outgress).testState('sendDataPacket', ctx);
		expect(ctx.try).toBe(4);
		expect(c.next.timeout.mock.calls[0][0]).toBe(1000);
		expect(c.next.timeout.mock.calls[0][1]).toEqual('sendDataPacket');
	});

	test('abort if tries are > 3', () => {
		const ctx = {
			try: 4
		};
		const c = connection().testState('sendDataPacket', ctx);
		expect(c.next.mock.calls[0][0]).toBe(null);
	});

	test('prepare next chunk if ACK has been received', () => {
		const ingress = new EventEmitter();
		const outgress = new EventEmitter();
		const ctx = {
			clientKey: 'test',
			packet: Buffer.alloc(512 + 4),
			block: 12,
			try: 3,
			blocksize: 512
		};
		const c = connection(ingress, outgress).testState('sendDataPacket', ctx);
		ingress.emit(ctx.clientKey, Buffer.from([0, 4, 0, ctx.block]));
		expect(c.next.mock.calls[0][0]).toEqual('prepareDataPacket');
	});

	test('ignore other opcodes', () => {
		const ingress = new EventEmitter();
		const outgress = new EventEmitter();
		const ctx = {
			clientKey: 'test',
			packet: Buffer.alloc(0),
			block: 12,
			try: 3,
			blocksize: 512
		};
		const c = connection(ingress, outgress).testState('sendDataPacket', ctx);
		ingress.emit(ctx.clientKey, Buffer.from([0, 3, 0, ctx.block]));
		expect(c.next.mock.calls.length).toBe(0);
	});

	test('ignore wrong block number', () => {
		const ingress = new EventEmitter();
		const outgress = new EventEmitter();
		const ctx = {
			clientKey: 'test',
			packet: Buffer.alloc(0),
			block: 12,
			try: 3,
			blocksize: 512
		};
		const c = connection(ingress, outgress).testState('sendDataPacket', ctx);
		ingress.emit(ctx.clientKey, Buffer.from([0, 4, 0, ctx.block - 1]));
		expect(c.next.mock.calls.length).toBe(0);
	});

	test('end FSM if last packet has been acked', () => {
		const ingress = new EventEmitter();
		const outgress = new EventEmitter();
		const ctx = {
			clientKey: 'test',
			packet: Buffer.alloc(511 + 3),
			block: 12,
			try: 3,
			blocksize: 512
		};
		const c = connection(ingress, outgress).testState('sendDataPacket', ctx);
		ingress.emit(ctx.clientKey, Buffer.from([0, 4, 0, ctx.block]));
		expect(c.next.mock.calls[0][0]).toBe(null);
	});
});

describe('final', () => {
	[
		{ code: 0, msg: 'Some generic error message.' },
		{ code: 1, msg: 'File not found.' },
		{ code: 2, msg: 'Access violation.' },
		{ code: 3, msg: 'Disk full or allocation exceeded.' },
		{ code: 4, msg: 'Illegal TFTP operation.' },
		{ code: 5, msg: 'Unknown transfer ID.' },
		{ code: 6, msg: 'File already exists.' },
		{ code: 7, msg: 'No such user.' }
	].forEach((err) => {
		test(`Send Error: ${err.msg}`, (done) => {
			const ingress = new EventEmitter();
			const outgress = new EventEmitter();
			const clientKey = 'test';
			outgress.on(clientKey, (m) => {
				try {
					expect(m.readUInt16BE(0)).toBe(5);
					expect(m.readUInt16BE(2)).toBe(err.code);
					expect(m.toString('utf8', 4, m.length - 1)).toEqual(err.msg);
					expect(m[m.length - 1]).toBe(0);
					done();
				} catch (e) { done(e); }
			});
			const c = connection(ingress, outgress).testState('_final', { clientKey }, new Error(err.msg));
			expect(c.next.mock.calls.length).toBe(1);
		});
	});
});
