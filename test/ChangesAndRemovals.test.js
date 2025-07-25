"use strict";

require("./helpers/warmup-webpack");

const path = require("path");
const fs = require("graceful-fs");
const { Volume, createFsFromVolume } = require("memfs");
const rimraf = require("rimraf");

const createCompiler = (config) => {
	const webpack = require("..");

	const compiler = webpack(config);
	compiler.outputFileSystem = createFsFromVolume(new Volume());
	return compiler;
};

const tempFolderPath = path.join(__dirname, "ChangesAndRemovalsTemp");
const tempFilePath = path.join(tempFolderPath, "temp-file.js");
const tempFile2Path = path.join(tempFolderPath, "temp-file2.js");

const createSingleCompiler = () =>
	createCompiler({
		entry: tempFilePath,
		output: {
			path: tempFolderPath,
			filename: "bundle.js"
		}
	});

const onceDone = (compiler, action) => {
	let initial = true;
	compiler.hooks.done.tap("ChangesAndRemovalsTest", () => {
		if (!initial) return;
		initial = false;
		setTimeout(action, 1000);
	});
};

const getChanges = (compiler) => {
	const modifiedFiles = compiler.modifiedFiles;
	const removedFiles = compiler.removedFiles;
	return {
		removed: removedFiles && [...removedFiles],
		modified: modifiedFiles && [...modifiedFiles]
	};
};

/**
 * @param {(err?: unknown) => void} callback callback
 */
function cleanup(callback) {
	rimraf(tempFolderPath, callback);
}

/**
 * @returns {void}
 */
function createFiles() {
	fs.mkdirSync(tempFolderPath, { recursive: true });

	fs.writeFileSync(
		tempFilePath,
		"module.exports = function temp() {return 'temp file';};\n require('./temp-file2')",
		"utf8"
	);

	fs.writeFileSync(
		tempFile2Path,
		"module.exports = function temp2() {return 'temp file 2';};",
		"utf8"
	);
}

jest.setTimeout(30000);

describe("ChangesAndRemovals", () => {
	beforeEach((done) => {
		cleanup((err) => {
			if (err) return done(err);
			createFiles();
			// Wait 2.5s after creating the files,
			// otherwise the newly-created files will trigger the webpack watch mode to re-compile.
			setTimeout(done, 2500);
		});
	});

	afterEach(cleanup);

	if (process.env.NO_WATCH_TESTS) {
		// eslint-disable-next-line jest/no-disabled-tests
		it.skip("watch tests excluded", () => {});

		return;
	}

	it("should not track modified/removed files during initial watchRun", (done) => {
		const compiler = createSingleCompiler();
		const watchRunFinished = new Promise((resolve) => {
			compiler.hooks.watchRun.tap("ChangesAndRemovalsTest", (compiler) => {
				expect(getChanges(compiler)).toEqual({
					removed: undefined,
					modified: undefined
				});
				resolve();
			});
		});
		const watcher = compiler.watch({ aggregateTimeout: 200 }, (err) => {
			if (err) done(err);
		});

		watchRunFinished.then(() => {
			watcher.close(done);
		});
	});

	it("should track modified files when they've been modified", (done) => {
		const compiler = createSingleCompiler();
		let watcher;

		compiler.hooks.watchRun.tap("ChangesAndRemovalsTest", (compiler) => {
			if (!watcher) return;
			if (!compiler.modifiedFiles) return;
			expect(getChanges(compiler)).toEqual({
				modified: [tempFilePath],
				removed: []
			});
			watcher.close(done);
			watcher = null;
		});

		watcher = compiler.watch({ aggregateTimeout: 200 }, (err) => {
			if (err) done(err);
		});

		onceDone(compiler, () => {
			fs.appendFileSync(tempFilePath, "\nlet x = 'file modified';");
		});
	});

	it("should track removed file when removing file", (done) => {
		const compiler = createSingleCompiler();
		let watcher;

		compiler.hooks.watchRun.tap("ChangesAndRemovalsTest", (compiler) => {
			if (!watcher) return;
			if (!compiler.modifiedFiles) return;
			expect(getChanges(compiler)).toEqual({
				removed: [tempFilePath],
				modified: []
			});
			watcher.close(done);
			watcher = null;
		});

		watcher = compiler.watch({ aggregateTimeout: 200 }, (err) => {
			if (err) done(err);
		});

		onceDone(compiler, () => {
			fs.unlinkSync(tempFilePath);
		});
	});
});
