/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

/** @typedef {import("../Compiler")} Compiler */

const PLUGIN_NAME = "AddBuildDependenciesPlugin";

class AddBuildDependenciesPlugin {
	/**
	 * @param {Iterable<string>} buildDependencies list of build dependencies
	 */
	constructor(buildDependencies) {
		this.buildDependencies = new Set(buildDependencies);
	}

	/**
	 * Apply the plugin
	 * @param {Compiler} compiler the compiler instance
	 * @returns {void}
	 */
	apply(compiler) {
		compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
			compilation.buildDependencies.addAll(this.buildDependencies);
		});
	}
}

module.exports = AddBuildDependenciesPlugin;
