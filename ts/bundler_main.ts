import {CLI} from "cli";
import * as fs from "fs";
import * as path from "path";
import {TSC} from "tsc";
import {Bundler} from "bundler";
import {ModuleManager} from "module_manager";
import {setLogVerbosityLevel, logError, logDebug} from "log";
import {StdinJsonInterface} from "stdin_json_interface";
import {setBundlerRoot} from "bundler_or_project_file";

export interface BundlerConfig {
	entryPointModule: string;
	entryPointFunction: string;
	environment: "node" | "browser";
	project: string; // path to tsconfig.json
	outDir: string;
	outFile: string;
}

export interface BundlerCliArgs {
	configPath: string;
	fancy?: boolean;
	devmode?: boolean;
	verbose?: boolean;
	help?: boolean;
	useStdio?: boolean;
}

export type BundlerMergedConfig = BundlerConfig & BundlerCliArgs;

function parseCliArgs(): BundlerCliArgs {
	return new CLI({
		helpHeader: "A helper tool to assemble Javascript bundles out of Typescript projects.",
		definition: {
			configPath: CLI.str({ keys: "--config", definition: "Path to bundler configuration file that contains project-specific settings. Example of config could be found in bundler_config_sample.json ." }),
			fancy: CLI.bool({ keys: "--fancy", definition: "Output beatiful debuggable code (instead of compressed mess that complies to older ECMA version)." }),
			devmode: CLI.bool({ keys: "--devmode", definition: "Enables compilation-after-any-source-change. Also sets --fancy to true." }),
			useStdio: CLI.bool({ keys: "--use-stdio", definition: "Enables communication with outside world through STDIO. Only usable in devmode." }),
			verbose: CLI.bool({ keys: ["-v", "--verbose"], definition: "Adds some more bundler-debug-related trash in stderr." }),
			help: CLI.help({ keys: ["-h", "--h", "-help", "--help"], definition: "Shows list of commands." })
		}
	}).parseArgs();
}

/** получаем единый конфиг тула, собранный из CLI-опций и значений в конфиге проекта */
function getMergedConfig(cliArgs: BundlerCliArgs): BundlerMergedConfig {
	let bundlerConfig = (() => {
		let rawConfig = fs.readFileSync(cliArgs.configPath, "utf8");
		try {
			return JSON.parse(rawConfig);
		} catch(e){
			logError("Failed to parse bundler config at" + cliArgs.configPath + ": JSON malformed: " + e.message);
			process.exit(1);
		}
	})();

	let config = { ...cliArgs, ...bundlerConfig } as (typeof cliArgs & BundlerConfig);

	setLogVerbosityLevel(config.verbose? 1: 0);

	if(config.devmode){
		config.fancy = true;
	}

	let configDirPath = path.dirname(config.configPath);
	config.configPath = path.resolve(config.configPath);
	config.outFile = path.resolve(configDirPath, config.outFile);
	config.outDir = path.resolve(configDirPath, config.outDir);
	config.project = path.resolve(configDirPath, config.project);

	return config;
}

function createCommonInstances(config: BundlerMergedConfig): { tsc: TSC, modman: ModuleManager, bundler: Bundler }{
	let tsc = new TSC({
		outDir: config.outDir,
		projectPath: config.project,
		target: config.fancy? "es2018": "es5",
		watch: !!config.devmode
	});

	let modman = new ModuleManager({
		outDir: config.outDir,
		tsconfigPath: config.project,
		minify: !config.fancy
	})

	let bundler = new Bundler({
		modman: modman,
		entryPointFunction: config.entryPointFunction,
		entryPointModule: config.entryPointModule,
		environment: config.environment,
		outFile: config.outFile
	});

	return {tsc, bundler, modman}
}

/** функция запуска бандлера в devmode
 * возвращает функцию, которая при вызове перезаписывает outFile и возвращает результат (успех/неуспех)
 */
export async function runBundlerDevmode(cliArgs: BundlerCliArgs, bundlerRoot: string = __dirname): Promise<() => Promise<boolean>>{
	setBundlerRoot(bundlerRoot);
	cliArgs.devmode = true;
	let mergedConfig = getMergedConfig(cliArgs);
	let {tsc, modman, bundler} = createCommonInstances(mergedConfig);
	return await doDevmode(tsc, modman, bundler, mergedConfig);
}

/** функция запуска бандлера в режиме одной компиляции */
export async function runBundlerSingle(cliArgs: BundlerCliArgs, bundlerRoot: string = __dirname): Promise<void>{
	setBundlerRoot(bundlerRoot);
	cliArgs.devmode = false;
	let {tsc, bundler} = createCommonInstances(getMergedConfig(cliArgs));
	await doSingleRun(tsc, bundler);
}

/** основная функция запуска бандлера. вызывается при запуске в качестве тула */
export async function tsBundlerMain(cliArgs: BundlerCliArgs = parseCliArgs()){
	if(cliArgs.devmode){
		await runBundlerDevmode(cliArgs);
	} else {
		await runBundlerSingle(cliArgs);
	}
}

type StdinAction = StdinBunldeAction;
interface StdinBunldeAction {
	action: "bundle"
}

async function doDevmode(tsc: TSC, modman: ModuleManager, bundler: Bundler, opts: BundlerMergedConfig){
	logDebug("Starting in devmode.");
	let isAssemblingNow = false;

	let afterReassembledHandlers = [] as (() => void)[];
	let startWaiter: (() => void) | null = null;

	async function assemble(): Promise<boolean> {
		logDebug("Starting to assemble the bundle.");
		let success = true;

		try {
			if(!tsc.isRunning){
				// этот слип здесь из-за моей паранойи. я не встречался с проблемами из-за его отсутствия
				// смысл в том, что к моменту вызова assemble() tsc может еще не увидеть, что файлы изменились
				// и поэтому нужно подождать, вдруг запустится
				await new Promise(ok => setTimeout(ok, 500));
			}
	
			if(tsc.isRunning){
				await new Promise(ok => tsc.afterCompilationRun.once(ok))
			}
			
	
			if(tsc.codeBroken){
				logError("Won't assemble bundle: last compilation was not successful.")
				success = false;
			}
	
			if(isAssemblingNow){
				await new Promise(ok => afterReassembledHandlers.push(ok))
			}
	
			isAssemblingNow = true;
			try {
				await bundler.assembleBundle();
				logDebug("Bundle assembled.");
			} finally {
				isAssemblingNow = false;
				if(afterReassembledHandlers.length > 0){
					(afterReassembledHandlers.pop() as (() => void))();
				}
			}
		} catch(e){
			logError("Failed: " + e.stack)
			success = false;
		}

		return success;
	}
	
	if(opts.useStdio){
		let stdinWrap = new StdinJsonInterface();
		stdinWrap.onInput(async (action: StdinAction) => {
			if(typeof(action) !== "object" || !action || Array.isArray(action)){
				throw new Error("Expected JSON object as stdin input, got " + action + " instead.");
			}

			switch(action.action){
				case "bundle": 
					let success = await assemble();
					process.stdout.write(JSON.stringify({"action": "bundle", "success": success}) + "\n");
					return;
				default: throw new Error("Unknown stdin action type: " + action.action);
			}
		});
	}
	

	let firstRun = true;
	tsc.afterCompilationRun(async results => {
		results.filesChanged.forEach(file => {
			modman.invalidateModuleByPath(file);
		})
		logDebug("Compilation success: " + (results.success? "true": "false") + "; files changed: " + results.filesChanged.length);
		if(firstRun){
			if(opts.useStdio){
				process.stdout.write(JSON.stringify({"action": "start", "success": true}) + "\n");
			}
			
			firstRun = false;
			if(startWaiter){
				startWaiter();
				startWaiter = null;
			}
		}
	});

	tsc.run();
	await new Promise(ok => {
		startWaiter = ok
	});

	return assemble;
}

async function doSingleRun(tsc: TSC, bundler: Bundler){
	logDebug("Running TSC.");
	await tsc.run();
	logDebug("TSC completed; assembling bundle.");
	await bundler.assembleBundle();
	logDebug("Bundle assebmled.");
}