import {ModuleManager} from "module_manager";
import {DependencyTraverser} from "dependency_traverser";
import {fsReadFile, fsWrite} from "async_fs";
import * as path from "path";
import {logDebug} from "log";
import {getBundlerRoot} from "bundler_or_project_file";


export interface BundlerOptions {
	modman: ModuleManager;
	environment: "node" | "browser";
	outFile: string;
	entryPointModule: string;
	entryPointFunction: string;
}

interface HelperFunctionsCode {
	onPackageNotFound: string;
	waitLoad: string;
	runner: string;
}

/** класс, который собирает из множества уже скомпиленных ts-файлов один большой js-файл */
export class Bundler {

	private readonly opts: BundlerOptions;
	
	constructor(opts: BundlerOptions){
		this.opts = opts;
	}

	/** основная функция сборки бандла
	 * в результате её вызова в outFile пишется js-файл с бандлом */
	async assembleBundle(){
		let bundleCode = await this.getBundleCodeStr();
		await fsWrite(this.opts.outFile, new Buffer(bundleCode, "utf8"));
	}

	private async getBundleCodeStr(){
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
);`
	}

	/** получить строку, в которой содержится JSON-объект типа "имя модуля" -> "код модуля" */
	private async getModuleMapString(): Promise<string> {
		// здесь мы собираем JSON около-вручную, вместо того, чтобы собрать объект и сделать ему один JSON.stringify
		// нужно это потому, что порядок ключей внутри object-а не гарантируется
		// а нам хочется получать стабильный вывод, который не будет меняться без причины
		// (это нужно, например, для кеширования скрипта по его хешу)
		let traverser = new DependencyTraverser(this.opts.modman);
		let moduleSet = await traverser.getTransitiveDependenciesFor(this.opts.entryPointModule);
		let moduleList = [...moduleSet].sort().filter(_ => _ !== "tslib");
		let pairStrings = await Promise.all(moduleList.map(async name => {
			let mod = await this.opts.modman.getModule(name);
			return JSON.stringify(name) + ":" + JSON.stringify(mod.minCode);
		}));
		logDebug("Got base module name-code pairs.");

		if(moduleSet.has("tslib")){
			// tslib крепим как просто еще один модуль, но обрабатывать его после запуска будем по-особому
			pairStrings.push(JSON.stringify("tslib") + ":" + JSON.stringify(await this.opts.modman.getTslib()));
			logDebug("Added tslib.");
		}
		
		return "{\n" + pairStrings.join(",\n") + "\n}";
	}

	private helpersCode: HelperFunctionsCode | null = null;
	private async getHelperFunctionsCode(): Promise<HelperFunctionsCode> {
		if(!this.helpersCode){
			let helpersRoot = path.resolve(getBundlerRoot(), "./parts");
			let envHelpersRoot = path.resolve(helpersRoot, this.opts.environment);
			let [onPackageNotFound, waitLoad, runner] = await Promise.all([
				path.resolve(envHelpersRoot, "on_package_not_found.js"),
				path.resolve(envHelpersRoot, "wait_load.js"),
				path.resolve(helpersRoot, "runner.js")
			].map(async p => (await fsReadFile(p)).toString("utf8")));

			this.helpersCode = { onPackageNotFound, waitLoad, runner }
		}

		return this.helpersCode;
	}

}