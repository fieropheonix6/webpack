"use strict";

module.exports = function supportsObjectDestructuring() {
	try {
		const f = eval("(function f({x, y}) { return x + y; })");
		return f({ x: 1, y: 2 }) === 3;
	} catch (_err) {
		return false;
	}
};
