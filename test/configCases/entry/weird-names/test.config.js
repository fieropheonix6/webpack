"use strict";

module.exports = {
	findBundle(i, options) {
		return [
			`./${options.target}/folder/entry/-x/file.js`,
			`./${options.target}/folder/x-/-x/file.js`,
			`./${options.target}/folder/x-../entry-x/file.js`
		];
	}
};
