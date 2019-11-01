/** код в этом файле нужен, чтобы запускать сам бандлер
 * вручную его запускать не нужно никогда, он подклеивается к результату компиляции самого бандлера в compile.sh
 */

let define = (() => {
	setTimeout(async () => {
		try {
			let mainPackageName = "bundler_main";
			let mainFunctionName = "tsBundlerMain";
			let pkg = resolve(mainPackageName);
			await Promise.resolve(pkg[mainFunctionName].call(null));
		} catch(e){
			console.error("Bundler failed:");
			console.error(e.stack);
			process.exit(1);
		}
	}, 1);

	let defMap = {};
	let products = {require: require};
	let currentlyResolvingModules = new Set();

	function resolve(name){
		if(name in products){
			return products[name];
		}

		if(currentlyResolvingModules.has(name))
			throw new Error("Could not run bundler: recursive dependency for " + name + " (through " + [...currentlyResolvingModules].join(", ") + ")");

		if(!(name in defMap)){
			return require(name); // а что это еще может быть? только модуль ноды
		}

		currentlyResolvingModules.add(name);
		try {
			let exports = {};
			let deps = defMap[name].deps.map(depName => {
				if(depName === "exports")
					return exports;
				else
					return resolve(depName);
			});

			defMap[name].def.apply(null, deps);
			products[name] = exports;
			return exports;
		} finally {
			currentlyResolvingModules.delete(name);
		}
	}
	
	return function define(name, deps, def){
		defMap[name] = {deps, def};
	}
})();

define("async_fs", ["require", "exports", "fs"], function (require, exports, fs) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function fsStat(path, opts) {
        return new Promise((ok, bad) => {
            let cb = (err, res) => {
                if (err) {
                    bad(err);
                }
                else {
                    ok(res);
                }
            };
            try {
                opts ? fs.stat(path, opts, cb) : fs.stat(path, cb);
            }
            catch (e) {
                bad(e);
            }
        });
    }
    exports.fsStat = fsStat;
    function fsReadFile(path, options) {
        return new Promise((ok, bad) => {
            try {
                fs.readFile(path, options, (err, res) => {
                    err ? bad(err) : ok(res);
                });
            }
            catch (e) {
                bad(e);
            }
        });
    }
    exports.fsReadFile = fsReadFile;
    function fsUnlink(path) {
        return new Promise((ok, bad) => {
            try {
                fs.unlink(path, err => err ? bad(err) : ok());
            }
            catch (e) {
                bad(e);
            }
        });
    }
    exports.fsUnlink = fsUnlink;
    function fsWrite(path, data) {
        return new Promise((ok, bad) => {
            try {
                fs.writeFile(path, data, err => err ? bad(err) : ok());
            }
            catch (e) {
                bad(e);
            }
        });
    }
    exports.fsWrite = fsWrite;
});
define("eval_module", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function evalModule(name, code) {
        let dependencies = null;
        let define = (deps) => {
            if (dependencies)
                throw new Error("Double define() call from definition of module " + name);
            dependencies = deps;
        };
        void define;
        eval(code);
        if (!dependencies)
            throw new Error("No define() call from definition of module " + name);
        return { dependencies };
    }
    exports.evalModule = evalModule;
});
define("module_name", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ModuleName = {
        normalize(name) {
            let x = name;
            let xx = x;
            while (true) {
                xx = x.replace(/[^\/]+\/\.\.\//g, "");
                if (xx.length === x.length)
                    break;
                x = xx;
            }
            while (true) {
                xx = x.replace(/\.\//g, "");
                if (xx.length === x.length)
                    break;
                x = xx;
            }
            return x;
        },
        resolve(base, name) {
            return name.charAt(0) !== "." ? name : this.join(this.dirname(base), name);
        },
        join(...args) {
            let result = args.map((arg, i) => {
                if (i !== 0)
                    arg = arg.replace(/^\//, "");
                if (i !== args.length - 1)
                    arg = arg.replace(/\/$/, "");
                return arg;
            }).filter(_ => !!_);
            return this.normalize(result.join("/"));
        },
        dirname(name) {
            return name.replace(/\/?[^\/]+$/, "");
        }
    };
});
define("log", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    let logVerbosityLevel = 0;
    function twoDig(x) { return (x > 9 ? "" : "0") + x; }
    function threeDig(x) { return x > 99 ? "" + x : "0" + twoDig(x); }
    function timeStr() {
        let d = new Date();
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${twoDig(d.getHours())}:${twoDig(d.getMinutes())}:${twoDig(d.getSeconds())}:${threeDig(d.getMilliseconds())}`;
    }
    function setLogVerbosityLevel(level) {
        logVerbosityLevel = level;
    }
    exports.setLogVerbosityLevel = setLogVerbosityLevel;
    function logWithLevel(verbosityLevel, str) {
        if (verbosityLevel <= logVerbosityLevel)
            console.error(timeStr() + " " + str);
    }
    function logError(str) { return logWithLevel(-2, str); }
    exports.logError = logError;
    function logWarn(str) { return logWithLevel(-1, str); }
    exports.logWarn = logWarn;
    function logInfo(str) { return logWithLevel(0, str); }
    exports.logInfo = logInfo;
    function logDebug(str) { return logWithLevel(1, str); }
    exports.logDebug = logDebug;
});
define("bundler_or_project_file", ["require", "exports", "path", "fs"], function (require, exports, path, fs) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    let exists = (x) => {
        try {
            fs.statSync(x);
            return true;
        }
        catch (e) {
            return false;
        }
    };
    function findBundlerOrProjectFile(projectPath, relPath) {
        let bundlerTsc = path.resolve(bundlerRoot, relPath);
        let projectTsc = path.resolve(path.dirname(projectPath), relPath);
        if (exists(bundlerTsc))
            return bundlerTsc;
        if (exists(projectTsc))
            return projectTsc;
        return null;
    }
    exports.findBundlerOrProjectFile = findBundlerOrProjectFile;
    let bundlerRoot = __dirname;
    function setBundlerRoot(root) {
        bundlerRoot = root;
    }
    exports.setBundlerRoot = setBundlerRoot;
    function getBundlerRoot() {
        return bundlerRoot;
    }
    exports.getBundlerRoot = getBundlerRoot;
});
define("path_includes", ["require", "exports", "path"], function (require, exports, path) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function pathIncludes(parentPath, childPath) {
        childPath = path.resolve(childPath);
        parentPath = path.resolve(parentPath);
        if (process.platform === 'win32') {
            childPath = childPath.toLowerCase();
            parentPath = parentPath.toLowerCase();
        }
        if (childPath === parentPath) {
            return false;
        }
        childPath += path.sep;
        parentPath += path.sep;
        return childPath.startsWith(parentPath);
    }
    exports.pathIncludes = pathIncludes;
});
define("module_manager", ["require", "exports", "fs", "path", "async_fs", "eval_module", "module_name", "log", "bundler_or_project_file", "path_includes"], function (require, exports, fs, path, async_fs_1, eval_module_1, module_name_1, log_1, bundler_or_project_file_1, path_includes_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class ModuleNotFoundError {
        constructor(msg) {
            let e = new Error();
            this.stack = e.stack;
            this.message = msg;
        }
    }
    exports.ModuleNotFoundError = ModuleNotFoundError;
    const specialDependencyNames = new Set(["exports", "require", "tslib"]);
    class ModuleManager {
        constructor(opts) {
            this.knownModules = {};
            this._tslibCode = null;
            this.outDirs = this.extractSourcePathsFromConfig(opts.tsconfigPath, opts.outDir);
            this.tsconfigPath = opts.tsconfigPath;
        }
        async getModule(name) {
            if (!(name in this.knownModules)) {
                this.knownModules[name] = await this.discoverModule(name);
            }
            return this.knownModules[name];
        }
        async discoverModule(name) {
            let jsFilePath = await this.findModulePath(name);
            let code = (await async_fs_1.fsReadFile(jsFilePath)).toString("utf8");
            let { dependencies } = eval_module_1.evalModule(name, code);
            dependencies = dependencies
                .filter(dep => !specialDependencyNames.has(dep))
                .map(rawDep => module_name_1.ModuleName.resolve(name, rawDep));
            return { jsFilePath, code, dependencies };
        }
        async findModulePath(name) {
            let moduleEndPath = this.nameToPathPart(name);
            let paths = (await Promise.all(this.outDirs.map(async (outDir) => {
                let fullModulePath = path.resolve(outDir, moduleEndPath);
                try {
                    await async_fs_1.fsStat(fullModulePath);
                    return fullModulePath;
                }
                catch (e) {
                    return null;
                }
            }))).filter(_ => !!_);
            if (paths.length < 1) {
                throw new ModuleNotFoundError("Failed to find compiled file for module " + name);
            }
            if (paths.length > 1) {
                throw new Error("There is more than one compiled file for module " + name + "; not sure which to use: " + paths.join("; "));
            }
            return paths[0];
        }
        async invalidateModuleByPath(jsFilePath) {
            if (jsFilePath.toLowerCase().endsWith(".tsbuildinfo"))
                return;
            let name = this.pathToName(jsFilePath);
            if (!(name in this.knownModules))
                return;
            let mod = this.knownModules[name];
            delete this.knownModules[name];
            if (mod.jsFilePath !== path.resolve(jsFilePath)) {
                log_1.logWarn("Detected module movement: " + mod.jsFilePath + " -> " + jsFilePath + "; deleting outdated file.");
                await async_fs_1.fsUnlink(mod.jsFilePath);
            }
        }
        nameToPathPart(name) {
            return name.replace(/\//g, path.sep) + ".js";
        }
        pathToName(modulePath) {
            modulePath = path.resolve(modulePath);
            let includingDirs = this.outDirs.filter(outDir => path_includes_1.pathIncludes(outDir, modulePath));
            if (includingDirs.length < 1) {
                throw new Error("Compiled module file " + modulePath + " is not located in any expected output directories: " + this.outDirs.join("; "));
            }
            if (includingDirs.length > 1) {
                throw new Error("Compiled module file " + modulePath + " is resolved ambiguously to output directories: " + includingDirs.join("; "));
            }
            let namePath = path.relative(includingDirs[0], modulePath).replace(/\.[jJ][sS]$/, "");
            return namePath.split(path.sep).join("/");
        }
        extractSourcePathsFromConfig(tsConfigPath, outDir) {
            let rawTscConfig = fs.readFileSync(tsConfigPath, "utf8");
            let config;
            try {
                config = JSON.parse(rawTscConfig);
            }
            catch (e) {
                throw new Error("tsconfig.json (at " + tsConfigPath + ") is not valid JSON.");
            }
            if (!config.compilerOptions)
                throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected compilerOptions to be present.");
            if (config.compilerOptions.rootDir || config.compilerOptions.rootDirs)
                throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected no rootDir or rootDirs options to be present.");
            if (config.compilerOptions.baseUrl !== ".")
                throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected baseUrl option to be exactly \".\"");
            if (!config.compilerOptions.paths)
                throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected paths option to be present.");
            if (!config.compilerOptions.paths["*"])
                throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected paths option to have \"*\" wildcard value.");
            let rawPaths = config.compilerOptions.paths["*"];
            let tsconfigDir = path.dirname(tsConfigPath);
            let dirs = rawPaths.map(p => {
                if (!p.endsWith("*")) {
                    throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected all wildcard paths to end with wildcard (\"*\"), but this one is not: " + p);
                }
                let pathDir = path.dirname(p);
                let fullPath = path.resolve(tsconfigDir, pathDir);
                if (!path_includes_1.pathIncludes(tsconfigDir, fullPath))
                    throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected all wildcard paths to point to some dir inside project root (i.e. dir with tsconfig.json), but this one does not: " + p);
                return path.resolve(outDir, pathDir);
            });
            dirs = [...new Set(dirs)];
            for (let i = 0; i < dirs.length; i++) {
                for (let j = i + 1; j < dirs.length; j++) {
                    if (path_includes_1.pathIncludes(dirs[i], dirs[j]) || path_includes_1.pathIncludes(dirs[j], dirs[i]))
                        throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected all wildcard paths not to point into each other, but these two do: " + dirs[i] + "; " + dirs[j]);
                }
            }
            return dirs;
        }
        async getTslib() {
            if (!this._tslibCode) {
                let tslibPath = bundler_or_project_file_1.findBundlerOrProjectFile(this.tsconfigPath, "./node_modules/tslib/tslib.js");
                if (!tslibPath)
                    throw new Error("Failed to found TSLib.");
                this._tslibCode = (await async_fs_1.fsReadFile(tslibPath)).toString("utf8");
            }
            return this._tslibCode;
        }
    }
    exports.ModuleManager = ModuleManager;
});
define("dependency_traverser", ["require", "exports", "module_manager", "log"], function (require, exports, module_manager_1, log_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class DependencyTraverser {
        constructor(modman) {
            this.modSet = new OrderedSet();
            this.knownAbsentModules = new Set();
            this.modman = modman;
        }
        async getTransitiveDependencyListFor(name) {
            log_2.logDebug("Starting dependency traversing.");
            this.modSet.clear();
            this.knownAbsentModules.clear();
            let result = new Set();
            await this.getTransitiveDependencyListRecursive(name, result);
            if (this.knownAbsentModules.size > 0) {
                log_2.logWarn("Assuming following modules to be provided: " + [...this.knownAbsentModules].join(", "));
            }
            log_2.logDebug("Done traversing dependencies; full list of dependencies is " + result.size + " entries long.");
            return [...result].sort();
        }
        async getTransitiveDependencyListRecursive(name, result) {
            if (this.knownAbsentModules.has(name)) {
                return;
            }
            log_2.logDebug("Starting to resolve dependencies of " + name);
            if (this.modSet.has(name)) {
                let seq = [...this.modSet.asArray()];
                while (seq.length > 0 && seq[0] !== name) {
                    seq = seq.slice(1);
                }
                seq.push(name);
                throw new Error("Circular dependency detected: " + seq.join(" -> "));
            }
            if (result.has(name)) {
                return;
            }
            let mod;
            try {
                mod = await this.modman.getModule(name);
            }
            catch (e) {
                if (e instanceof module_manager_1.ModuleNotFoundError) {
                    log_2.logDebug("Known absent module found: " + name);
                    this.knownAbsentModules.add(name);
                }
                return;
            }
            result.add(name);
            this.modSet.push(name);
            try {
                for (let dep of mod.dependencies) {
                    await this.getTransitiveDependencyListRecursive(dep, result);
                }
            }
            finally {
                this.modSet.pop(name);
            }
        }
    }
    exports.DependencyTraverser = DependencyTraverser;
    class OrderedSet {
        constructor() {
            this.arr = [];
            this.set = new Set();
        }
        clear() {
            this.arr = [];
            this.set = new Set();
        }
        push(v) {
            this.arr.push(v);
            this.set.add(v);
        }
        pop(v) {
            if (this.arr[this.arr.length - 1] !== v)
                throw new Error("Incorrect push/pop order: expected " + this.arr[this.arr.length - 1] + ", got " + v);
            this.arr.pop();
            this.set.delete(v);
        }
        has(v) {
            return this.set.has(v);
        }
        asArray() {
            return this.arr;
        }
    }
});
define("bundler", ["require", "exports", "dependency_traverser", "async_fs", "path", "log", "bundler_or_project_file"], function (require, exports, dependency_traverser_1, async_fs_2, path, log_3, bundler_or_project_file_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Bundler {
        constructor(opts) {
            this.helpersCode = null;
            this.opts = opts;
        }
        async assembleBundle() {
            let bundleCode = await this.getBundleCodeStr();
            await async_fs_2.fsWrite(this.opts.outFile, new Buffer(bundleCode, "utf8"));
        }
        async getBundleCodeStr() {
            let [moduleMapStr, helpers] = await Promise.all([
                this.getModuleMapString(),
                this.getHelperFunctionsCode()
            ]);
            return `${helpers.runner}(
${JSON.stringify(this.opts.entryPointModule)},
${JSON.stringify(this.opts.entryPointFunction)},
${moduleMapStr},
${helpers.waitLoad},
${helpers.onPackageNotFound}
);`;
        }
        async getModuleMapString() {
            let traverser = new dependency_traverser_1.DependencyTraverser(this.opts.modman);
            let moduleList = await traverser.getTransitiveDependencyListFor(this.opts.entryPointModule);
            let pairStrings = await Promise.all(moduleList.map(async (name) => {
                let mod = await this.opts.modman.getModule(name);
                return JSON.stringify(name) + ":" + JSON.stringify(mod.code);
            }));
            log_3.logDebug("Got base module name-code pairs.");
            pairStrings.push(JSON.stringify("tslib") + ":" + JSON.stringify(await this.opts.modman.getTslib()));
            log_3.logDebug("Added tslib.");
            return "{\n" + pairStrings.join(",\n") + "\n}";
        }
        async getHelperFunctionsCode() {
            if (!this.helpersCode) {
                let helpersRoot = path.resolve(bundler_or_project_file_2.getBundlerRoot(), "./parts");
                let envHelpersRoot = path.resolve(helpersRoot, this.opts.environment);
                let [onPackageNotFound, waitLoad, runner] = await Promise.all([
                    path.resolve(envHelpersRoot, "on_package_not_found.js"),
                    path.resolve(envHelpersRoot, "wait_load.js"),
                    path.resolve(helpersRoot, "runner.js")
                ].map(async (p) => (await async_fs_2.fsReadFile(p)).toString("utf8")));
                this.helpersCode = { onPackageNotFound, waitLoad, runner };
            }
            return this.helpersCode;
        }
    }
    exports.Bundler = Bundler;
});
define("cli", ["require", "exports", "log"], function (require, exports, log_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class CLI {
        constructor(params) {
            this.params = params;
        }
        static get processArgvWithoutExecutables() {
            return process.argv.slice(2);
        }
        static defaultHelpPrinter(lines) {
            lines.forEach(line => console.error(line));
            return process.exit(1);
        }
        static printErrorAndExit(error) {
            log_4.logError(error.message);
            return process.exit(1);
        }
        static str(params) {
            return {
                default: params.default,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                allowedValues: params.allowedValues,
                definition: params.definition,
                type: "string"
            };
        }
        static bool(params) {
            return {
                default: false,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                definition: params.definition,
                type: "bool"
            };
        }
        static help(params) {
            return {
                default: false,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                definition: params.definition,
                isHelp: true,
                type: "bool"
            };
        }
        static double(params) {
            return {
                default: params.default,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                allowedValues: params.allowedValues,
                definition: params.definition,
                type: "double"
            };
        }
        static int(params) {
            return {
                default: params.default,
                keys: Array.isArray(params.keys) ? params.keys : [params.keys],
                allowedValues: params.allowedValues,
                definition: params.definition,
                type: "int"
            };
        }
        fail(msg) {
            return (this.params.onError || CLI.printErrorAndExit)(new Error(msg));
        }
        printHelp() {
            let helpLines = this.params.helpHeader ? [this.params.helpHeader] : [];
            let argNames = Object.keys(this.params.definition);
            let keyPart = (argName) => {
                let def = this.params.definition[argName];
                return def.keys.join(", ") + " (" + def.type + ")";
            };
            let maxKeyLength = argNames.map(argName => keyPart(argName).length).reduce((a, b) => Math.max(a, b), 0);
            argNames.forEach(argName => {
                let def = this.params.definition[argName];
                let line = keyPart(argName);
                while (line.length < maxKeyLength)
                    line += " ";
                if (def.definition) {
                    line += ": " + def.definition;
                }
                if (def.allowedValues) {
                    line += " Allowed values: " + def.allowedValues.join(", ") + ".";
                }
                helpLines.push(line);
            });
            (this.params.showHelp || CLI.defaultHelpPrinter)(helpLines);
        }
        buildKeysMap() {
            let result = new Map();
            Object.keys(this.params.definition).forEach(argName => {
                let keys = this.params.definition[argName].keys;
                if (keys.length === 0) {
                    this.fail("CLI argument \"" + argName + "\" has no keys with which it could be passed.");
                }
                keys.forEach(key => {
                    if (result.has(key)) {
                        this.fail("CLI argument key \"" + key + "\" is bound to more than one argument: \"" + argName + "\", \"" + result.get(key) + "\".");
                    }
                    result.set(key, argName);
                });
            });
            return result;
        }
        parseArgs(values = CLI.processArgvWithoutExecutables) {
            let result = this.extract(values);
            let haveHelp = false;
            let abstentMandatories = [];
            Object.keys(this.params.definition).forEach(argName => {
                let def = this.params.definition[argName];
                if (def.isHelp && !!result[argName]) {
                    haveHelp = true;
                }
                if (argName in result) {
                    if (def.allowedValues) {
                        let s = new Set(def.allowedValues);
                        if (!s.has(result[argName])) {
                            this.fail("Value of CLI argument \"" + argName + "\" is not in allowed values set: it's \"" + result[argName] + ", while allowed values are " + def.allowedValues.map(x => "\"" + x + "\"").join(", "));
                        }
                    }
                    return;
                }
                if (def.default !== undefined) {
                    result[argName] = def.default;
                }
                else {
                    abstentMandatories.push(argName);
                }
            });
            if (haveHelp) {
                this.printHelp();
            }
            if (abstentMandatories.length > 0) {
                this.fail("Some mandatory CLI arguments are absent: " + abstentMandatories.map(x => "\"" + x + "\"").join(", "));
            }
            return result;
        }
        extract(values) {
            let knownArguments = new Set();
            let keyToArgNameMap = this.buildKeysMap();
            let result = {};
            for (let i = 0; i < values.length; i++) {
                let v = values[i];
                if (!keyToArgNameMap.has(v)) {
                    this.fail("Unknown CLI argument key: \"" + v + "\".");
                }
                let argName = keyToArgNameMap.get(v);
                if (knownArguments.has(argName)) {
                    this.fail("CLI argument \"" + argName + "\" passed more than once, last time with key \"" + v + "\".");
                }
                knownArguments.add(argName);
                let actualValue;
                let def = this.params.definition[argName];
                switch (def.type) {
                    case "bool":
                        actualValue = true;
                        break;
                    case "string":
                    case "int":
                    case "double":
                        if (i === values.length - 1) {
                            this.fail("Expected to have some value after CLI key \"" + v + "\".");
                        }
                        i++;
                        actualValue = values[i];
                        if (def.type === "int" || def.type === "double") {
                            let num = parseFloat(actualValue);
                            if (!Number.isFinite(num)) {
                                this.fail("Expected to have number after CLI key \"" + v + "\", got \"" + actualValue + "\" instead.");
                            }
                            if (def.type === "int" && (num % 1) !== 0) {
                                this.fail("Expected to have integer number after CLI key \"" + v + "\", got \"" + actualValue + "\" instead (it's fractional).");
                            }
                            actualValue = num;
                        }
                }
                result[argName] = actualValue;
            }
            return result;
        }
    }
    exports.CLI = CLI;
});
define("event", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function event() {
        let listeners = new Map();
        let result = (listener) => { listeners.set(listener, { fn: listener }); };
        result.unsubscribe = (listener) => { listeners.delete(listener); };
        result.fire = (args) => listeners.forEach(_ => {
            _.fn(args);
            if (_.once)
                listeners.delete(_.fn);
        });
        result.once = (listener) => { listeners.set(listener, { fn: listener, once: true }); };
        return result;
    }
    exports.event = event;
});
define("tsc", ["require", "exports", "path", "event", "child_process", "log", "bundler_or_project_file"], function (require, exports, path, event_1, childProcess, log_5, bundler_or_project_file_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function waitEventOnce(obj, evtName) {
        return new Promise(ok => obj.once(evtName, ok));
    }
    class TSC {
        constructor(opts) {
            this._runningCount = 0;
            this._codeBroken = false;
            this.afterCompilationRun = event_1.event();
            this.lastCompilationFileChanges = [];
            this.opts = opts;
            this.tscPath = this.findTsc();
        }
        findTsc() {
            let path = bundler_or_project_file_3.findBundlerOrProjectFile(this.opts.projectPath, "./node_modules/typescript/bin/tsc");
            if (!path)
                throw new Error("Could not find tsc executable.");
            return path;
        }
        get isRunning() {
            return !!this._runningCount;
        }
        get codeBroken() {
            return this._codeBroken;
        }
        generateTscArguments(opts) {
            return [
                "--project", opts.projectPath,
                "--outDir", opts.outDir,
                "--rootDir", path.dirname(opts.projectPath),
                "--target", opts.target,
                "--module", "AMD",
                "--moduleResolution", "Node",
                "--importHelpers",
                "--noEmitHelpers",
                "--incremental",
                !opts.watch ? "" : "--watch",
                !opts.watch ? "" : "--listEmittedFiles",
            ].filter(_ => !!_);
        }
        async run() {
            let opts = this.opts;
            if (!opts.watch) {
                let proc = this.createProcess(opts);
                proc.stderr.on("data", data => console.error(data.toString("utf8")));
                proc.stdout.on("data", data => console.error(data.toString("utf8")));
                let exitCode = await waitEventOnce(proc, "exit");
                if (exitCode !== 0) {
                    throw new Error("TSC exited with code " + exitCode);
                }
            }
            else {
                let proc = this.createProcess(opts);
                proc.stdout.on("data", data => {
                    data.toString("utf8")
                        .split("\n")
                        .forEach(line => this.processWatchLine(line));
                });
                proc.stderr.on("data", data => console.error(data.toString("utf8")));
                let exitCode = await waitEventOnce(proc, "exit");
                throw new Error("TSC in watch mode unexpectedly exited with code " + exitCode);
            }
        }
        processWatchLine(line) {
            let lc = line.toLowerCase().replace("\u001bc", "").trim();
            line = line.replace("\u001bc", "").trim();
            if (lc.startsWith("tsfile: ")) {
                this.lastCompilationFileChanges.push(line.substr("tsfile: ".length).trim());
            }
            else if (lc.match(/^[\d:\-\s]+starting\s+compilation\s+in\s+watch\s+mode/) || lc.match(/^[\d:\-\s]+file\s+change\s+detected/)) {
                this.startRunning();
            }
            else if (lc.match(/^[\d:\-\s]+found\s+0\s+errors/)) {
                this.stopRunning(true);
            }
            else if (lc.match(/^[\d:\-\s]+found\s+\d+\s+errors/)) {
                this.stopRunning(false);
            }
            else if (line.trim()) {
                console.error(line);
            }
        }
        startRunning() {
            if (this.lastCompilationFileChanges.length > 0 && !this.isRunning) {
                throw new Error("Something strange happened (duplicate compilation start?)");
            }
            this._runningCount++;
        }
        stopRunning(success) {
            this._runningCount--;
            if (this.isRunning)
                return;
            this._codeBroken = !success;
            let data = {
                filesChanged: this.lastCompilationFileChanges,
                success
            };
            this.lastCompilationFileChanges = [];
            this.afterCompilationRun.fire(data);
        }
        createProcess(opts) {
            let args = this.generateTscArguments(opts);
            let proc = childProcess.spawn(this.tscPath, args, {
                cwd: path.dirname(opts.projectPath),
                windowsHide: true
            });
            proc.on("error", e => log_5.logError("TSC process errored: " + e.message));
            return proc;
        }
    }
    exports.TSC = TSC;
});
define("stdin_json_interface", ["require", "exports", "event", "log"], function (require, exports, event_2, log_6) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class StdinJsonInterface {
        constructor() {
            this.onInput = event_2.event();
            let line = "";
            process.stdin.on("data", data => {
                line += data.toString("utf8");
                if (line.endsWith("\n")) {
                    let input;
                    try {
                        input = JSON.parse(line);
                    }
                    catch (e) {
                        log_6.logError("Could not parse JSON from stdin: " + line);
                        return;
                    }
                    finally {
                        line = "";
                    }
                    try {
                        this.onInput.fire(input);
                    }
                    catch (e) {
                        log_6.logError("Failed to process stdin input: " + e.stack);
                    }
                }
            });
        }
    }
    exports.StdinJsonInterface = StdinJsonInterface;
});
define("bundler_main", ["require", "exports", "cli", "fs", "path", "tsc", "bundler", "module_manager", "log", "stdin_json_interface", "bundler_or_project_file"], function (require, exports, cli_1, fs, path, tsc_1, bundler_1, module_manager_2, log_7, stdin_json_interface_1, bundler_or_project_file_4) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function parseCliArgs() {
        return new cli_1.CLI({
            helpHeader: "A helper tool to assemble Javascript bundles out of Typescript projects.",
            definition: {
                configPath: cli_1.CLI.str({ keys: "--config", definition: "Path to bundler configuration file that contains project-specific settings." }),
                fancy: cli_1.CLI.bool({ keys: "--fancy", definition: "Output beatiful debuggable code (instead of compressed mess that complies to older ECMA version)." }),
                devmode: cli_1.CLI.bool({ keys: "--devmode", definition: "Toggles compilation-after-any-source-change. Also sets --fancy to true." }),
                verbose: cli_1.CLI.bool({ keys: ["-v", "--verbose"], definition: "Adds some more bundler-debug-related trash in stderr." }),
                help: cli_1.CLI.help({ keys: ["-h", "--h", "-help", "--help"], definition: "Shows list of commands." })
            }
        }).parseArgs();
    }
    function getMergedConfig(cliArgs) {
        let bundlerConfig = (() => {
            let rawConfig = fs.readFileSync(cliArgs.configPath, "utf8");
            try {
                return JSON.parse(rawConfig);
            }
            catch (e) {
                log_7.logError("Failed to parse bundler config at" + cliArgs.configPath + ": JSON malformed: " + e.message);
                process.exit(1);
            }
        })();
        let config = { ...cliArgs, ...bundlerConfig };
        log_7.setLogVerbosityLevel(config.verbose ? 1 : 0);
        if (config.devmode) {
            config.fancy = true;
        }
        let configDirPath = path.dirname(config.configPath);
        config.configPath = path.resolve(config.configPath);
        config.outFile = path.resolve(configDirPath, config.outFile);
        config.outDir = path.resolve(configDirPath, config.outDir);
        config.project = path.resolve(configDirPath, config.project);
        return config;
    }
    function createCommonInstances(config) {
        let tsc = new tsc_1.TSC({
            outDir: config.outDir,
            projectPath: config.project,
            target: config.fancy ? "es2018" : "es5",
            watch: !!config.devmode
        });
        let modman = new module_manager_2.ModuleManager({
            outDir: config.outDir,
            tsconfigPath: config.project
        });
        let bundler = new bundler_1.Bundler({
            modman: modman,
            entryPointFunction: config.entryPointFunction,
            entryPointModule: config.entryPointModule,
            environment: config.environment,
            outFile: config.outFile
        });
        return { tsc, bundler, modman };
    }
    async function runBundlerDevmode(cliArgs, bundlerRoot = __dirname, devmodeOpts = {}) {
        bundler_or_project_file_4.setBundlerRoot(bundlerRoot);
        cliArgs.devmode = true;
        let { tsc, modman, bundler } = createCommonInstances(getMergedConfig(cliArgs));
        return await doDevmode(tsc, modman, bundler, devmodeOpts);
    }
    exports.runBundlerDevmode = runBundlerDevmode;
    async function runBundlerSingle(cliArgs, bundlerRoot = __dirname) {
        bundler_or_project_file_4.setBundlerRoot(bundlerRoot);
        cliArgs.devmode = false;
        let { tsc, bundler } = createCommonInstances(getMergedConfig(cliArgs));
        await doSingleRun(tsc, bundler);
    }
    exports.runBundlerSingle = runBundlerSingle;
    async function tsBundlerMain(cliArgs = parseCliArgs()) {
        if (cliArgs.devmode) {
            await runBundlerDevmode(cliArgs, __dirname, { useStdio: true });
        }
        else {
            await runBundlerSingle(cliArgs);
        }
    }
    exports.tsBundlerMain = tsBundlerMain;
    async function doDevmode(tsc, modman, bundler, opts = {}) {
        log_7.logDebug("Starting in devmode.");
        let isAssemblingNow = false;
        let afterReassembledHandlers = [];
        let startWaiter = null;
        async function assemble() {
            log_7.logDebug("Starting to assemble the bundle.");
            let success = true;
            try {
                if (!tsc.isRunning) {
                    await new Promise(ok => setTimeout(ok, 500));
                }
                if (tsc.isRunning) {
                    await new Promise(ok => tsc.afterCompilationRun.once(ok));
                }
                if (tsc.codeBroken) {
                    log_7.logError("Won't assemble bundle: last compilation was not successful.");
                    success = false;
                }
                if (isAssemblingNow) {
                    await new Promise(ok => afterReassembledHandlers.push(ok));
                }
                isAssemblingNow = true;
                try {
                    await bundler.assembleBundle();
                    log_7.logDebug("Bundle assembled.");
                }
                finally {
                    isAssemblingNow = false;
                    if (afterReassembledHandlers.length > 0) {
                        afterReassembledHandlers.pop()();
                    }
                }
            }
            catch (e) {
                log_7.logError("Failed: " + e.stack);
                success = false;
            }
            return success;
        }
        if (opts.useStdio) {
            let stdinWrap = new stdin_json_interface_1.StdinJsonInterface();
            stdinWrap.onInput(async (action) => {
                if (typeof (action) !== "object" || !action || Array.isArray(action)) {
                    throw new Error("Expected JSON object as stdin input, got " + action + " instead.");
                }
                switch (action.action) {
                    case "bundle":
                        let success = await assemble();
                        process.stdout.write(JSON.stringify({ "action": "bundle", "success": success }) + "\n");
                        return;
                    default: throw new Error("Unknown stdin action type: " + action.action);
                }
            });
        }
        let firstRun = true;
        tsc.afterCompilationRun(async (results) => {
            results.filesChanged.forEach(file => {
                modman.invalidateModuleByPath(file);
            });
            log_7.logDebug("Compilation success: " + (results.success ? "true" : "false") + "; files changed: " + results.filesChanged.length);
            if (firstRun) {
                if (opts.useStdio) {
                    process.stdout.write(JSON.stringify({ "action": "start", "success": true }) + "\n");
                }
                firstRun = false;
                if (startWaiter) {
                    startWaiter();
                    startWaiter = null;
                }
            }
        });
        tsc.run();
        await new Promise(ok => {
            startWaiter = ok;
        });
        return assemble;
    }
    async function doSingleRun(tsc, bundler) {
        log_7.logDebug("Running TSC.");
        await tsc.run();
        log_7.logDebug("TSC completed; assembling bundle.");
        await bundler.assembleBundle();
        log_7.logDebug("Bundle assebmled.");
    }
});
