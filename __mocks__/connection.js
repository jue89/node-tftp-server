module.exports = jest.fn(() => {
	module.exports.run = jest.fn(() => ({}));
	return module.exports;
});
