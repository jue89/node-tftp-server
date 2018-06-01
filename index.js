const util = require('util');

const fs = require('fs');
const path = require('path');
const readFile = util.promisify(fs.readFile);

const TFTPServer = require('./tftp-server.js');

module.exports.TFTPServer = TFTPServer;
module.exports.createServer = () => new TFTPServer();
module.exports.serveStatic = (dir) => (req, res, next) => {
	readFile(path.join(dir, req.filename))
		.then((data) => res(data))
		.catch((e) => next());
};
