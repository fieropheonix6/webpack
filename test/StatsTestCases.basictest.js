"use strict";

require("./helpers/warmup-webpack");

const path = require("path");
const fs = require("graceful-fs");
const rimraf = require("rimraf");
const webpack = require("..");
const captureStdio = require("./helpers/captureStdio");

/**
 * Escapes regular expression metacharacters
 * @param {string} str String to quote
 * @returns {string} Escaped string
 */
const quoteMeta = (str) => str.replace(/[-[\]\\/{}()*+?.^$|]/g, "\\$&");

const base = path.join(__dirname, "statsCases");
const outputBase = path.join(__dirname, "js", "stats");
const tests = fs
	.readdirSync(base)
	.filter(
		(testName) =>
			fs.existsSync(path.join(base, testName, "index.js")) ||
			fs.existsSync(path.join(base, testName, "webpack.config.js"))
	)
	.filter((testName) => {
		const testDirectory = path.join(base, testName);
		const filterPath = path.join(testDirectory, "test.filter.js");
		if (fs.existsSync(filterPath) && !require(filterPath)()) {
			// eslint-disable-next-line jest/no-disabled-tests, jest/valid-describe-callback
			describe.skip(testName, () => it("filtered", () => {}));

			return false;
		}
		return true;
	});

describe("StatsTestCases", () => {
	jest.setTimeout(30000);
	let stderr;

	beforeEach(() => {
		stderr = captureStdio(process.stderr, true);
	});

	afterEach(() => {
		stderr.restore();
	});

	for (const testName of tests) {
		// eslint-disable-next-line no-loop-func
		it(`should print correct stats for ${testName}`, (done) => {
			const outputDirectory = path.join(outputBase, testName);
			rimraf.sync(outputDirectory);
			fs.mkdirSync(outputDirectory, { recursive: true });
			let options = {
				mode: "development",
				entry: "./index",
				output: {
					filename: "bundle.js"
				}
			};
			if (fs.existsSync(path.join(base, testName, "webpack.config.js"))) {
				options = require(path.join(base, testName, "webpack.config.js"));
			}
			let testConfig = {};
			try {
				// try to load a test file
				testConfig = Object.assign(
					testConfig,
					require(path.join(base, testName, "test.config.js"))
				);
			} catch (_err) {
				// ignored
			}

			const resolvedOptions = Array.isArray(options) ? options : [options];
			for (const options of resolvedOptions) {
				if (!options.context) options.context = path.join(base, testName);
				if (!options.output) options.output = options.output || {};
				if (!options.output.path) options.output.path = outputDirectory;
				if (!options.plugins) options.plugins = [];
				if (!options.optimization) options.optimization = {};
				if (options.optimization.minimize === undefined) {
					options.optimization.minimize = false;
				}
				if (
					options.cache &&
					options.cache !== true &&
					options.cache.type === "filesystem"
				) {
					options.cache.cacheDirectory = path.resolve(
						outputBase,
						".cache",
						testName
					);
				}
			}
			const c = webpack(options);
			const compilers = c.compilers ? c.compilers : [c];
			for (const c of compilers) {
				const ifs = c.inputFileSystem;
				c.inputFileSystem = Object.create(ifs);
				c.inputFileSystem.readFile = function readFile() {
					// eslint-disable-next-line prefer-rest-params
					const args = Array.prototype.slice.call(arguments);
					const callback = args.pop();
					// eslint-disable-next-line no-useless-call
					ifs.readFile.apply(ifs, [
						...args,
						(err, result) => {
							if (err) return callback(err);
							if (!/\.(js|json|txt)$/.test(args[0])) {
								return callback(null, result);
							}
							callback(null, result.toString("utf8").replace(/\r/g, ""));
						}
					]);
				};
				c.hooks.compilation.tap("StatsTestCasesTest", (compilation) => {
					for (const hook of [
						"optimize",
						"optimizeModules",
						"optimizeChunks",
						"afterOptimizeTree",
						"afterOptimizeAssets",
						"beforeHash"
					]) {
						compilation.hooks[hook].tap("TestCasesTest", () =>
							compilation.checkConstraints()
						);
					}
				});
			}
			c.run((err, stats) => {
				if (err) return done(err);
				for (const compilation of [
					...(stats.stats ? stats.stats : [stats])
				].map((s) => s.compilation)) {
					compilation.logging.delete("webpack.Compilation.ModuleProfile");
				}
				expect(stats.hasErrors()).toBe(testName.endsWith("error"));
				if (!testName.endsWith("error") && stats.hasErrors()) {
					return done(
						new Error(
							stats.toString({
								all: false,
								errors: true,
								errorStack: true,
								errorDetails: true
							})
						)
					);
				}
				fs.writeFileSync(
					path.join(outputBase, testName, "stats.txt"),
					stats.toString({
						preset: "verbose",
						context: path.join(base, testName),
						colors: false
					}),
					"utf8"
				);

				let toStringOptions = {
					context: path.join(base, testName),
					colors: false
				};
				let hasColorSetting = false;
				if (typeof c.options.stats !== "undefined") {
					toStringOptions = c.options.stats;
					if (toStringOptions === null || typeof toStringOptions !== "object") {
						toStringOptions = { preset: toStringOptions };
					}
					if (!toStringOptions.context) {
						toStringOptions.context = path.join(base, testName);
					}
					hasColorSetting = typeof toStringOptions.colors !== "undefined";
				}
				if (Array.isArray(c.options) && !toStringOptions.children) {
					toStringOptions.children = c.options.map((o) => o.stats);
				}
				// mock timestamps
				for (const { compilation: s } of stats.stats ? stats.stats : [stats]) {
					expect(s.startTime).toBeGreaterThan(0);
					expect(s.endTime).toBeGreaterThan(0);
					s.endTime = new Date("04/20/1970, 12:42:42 PM").getTime();
					s.startTime = s.endTime - 1234;
				}
				let actual = stats.toString(toStringOptions);
				expect(typeof actual).toBe("string");
				if (!hasColorSetting) {
					actual = stderr.toString() + actual;
					actual = actual
						.replace(/\u001B\[[0-9;]*m/g, "")
						.replace(/[.0-9]+(\s?ms)/g, "X$1");
				} else {
					actual = stderr.toStringRaw() + actual;
					actual = actual
						.replace(/\u001B\[1m\u001B\[([0-9;]*)m/g, "<CLR=$1,BOLD>")
						.replace(/\u001B\[1m/g, "<CLR=BOLD>")
						.replace(/\u001B\[39m\u001B\[22m/g, "</CLR>")
						.replace(/\u001B\[([0-9;]*)m/g, "<CLR=$1>")
						.replace(/[.0-9]+(<\/CLR>)?(\s?ms)/g, "X$1$2");
				}
				// cspell:ignore Xdir
				const testPath = path.join(base, testName);
				actual = actual
					.replace(/\r\n?/g, "\n")
					.replace(/webpack [^ )]+(\)?) compiled/g, "webpack x.x.x$1 compiled")
					.replace(new RegExp(quoteMeta(testPath), "g"), `Xdir/${testName}`)
					.replace(/(\w)\\(\w)/g, "$1/$2")
					.replace(/, additional resolving: X ms/g, "")
					.replace(/Unexpected identifier '.+?'/g, "Unexpected identifier")
					.replace(/[.0-9]+(\s?(bytes|KiB|MiB|GiB))/g, "X$1")
					.replace(
						/ms\s\([0-9a-f]{6,32}\)|(?![0-9]+-)[0-9a-f-]{6,32}\./g,
						(match) => `${match.replace(/[0-9a-f]/g, "X")}`
					)
					// Normalize stack traces between Jest v27 and v30
					// Jest v27: at Object.<anonymous>.module.exports
					// Jest v30: at Object.module.exports
					.replace(/Object\.<anonymous>\./g, "Object.");
				expect(actual).toMatchSnapshot();

				if (testConfig.validate) {
					try {
						testConfig.validate(stats, stderr.toString());
					} catch (err) {
						done(err);
						return;
					}
				}

				done();
			});
		});
	}
});
