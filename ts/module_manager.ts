import * as fs from "fs";
import * as path from "path";
import {fsStat, fsReadFile, fsUnlink} from "async_fs";
import {evalModule} from "eval_module";
import {ModuleName} from "module_name";
import {logWarn} from "log";
import {findBundlerOrProjectFile} from "bundler_or_project_file";
import {pathIncludes} from "path_includes";
import {minifyJavascript} from "minify";

export class ModuleNotFoundError {

	readonly stack?: string;
	readonly message?: string;

	constructor(msg?: string){
		let e = new Error();
		this.stack = e.stack;
		this.message = msg; 
	}
}

/** то, что мы ожидаем увидеть в TsConfig-е. интересующие нас куски */
interface TsConfig {
	compilerOptions: {
		rootDir?: string;
		rootDirs?: string[];
		baseUrl: string;
		paths: { "*": string[] }
	}
}

export interface ModuleManagerOptions {
	outDir: string;
	minify: boolean;
	tsconfigPath: string;
}

export interface ModuleDescription {
	/** код модуля (т.е. "define(...)") */
	readonly code: string;

	/** минифицированная версия code. если minify = false, то просто code */
	readonly minCode: string;

	/** имена модулей, от которых этот модуль зависит */
	readonly dependencies: readonly string[];

	/** путь к файлу, в котором лежит скомпиленный код модуля */
	readonly jsFilePath: string;
}

const specialDependencyNames: ReadonlySet<string> = new Set(["exports", "require"]);

/** этот класс предоставляет доступ к скомпиленным файлам модулей и умеет извлекать из них информацию */
export class ModuleManager {

	private outDirs: readonly string[];
	private knownModules: { [k: string]: ModuleDescription } = {}
	private readonly tsconfigPath: string;
	private readonly needMinify: boolean;

	constructor(opts: ModuleManagerOptions){
		this.outDirs = this.extractSourcePathsFromConfig(opts.tsconfigPath, opts.outDir);
		this.tsconfigPath = opts.tsconfigPath;
		this.needMinify = opts.minify;
	}

	/** получить описание модуля по его имени */
	async getModule(name: string): Promise<ModuleDescription> {
		if(!(name in this.knownModules)){
			this.knownModules[name] = await this.discoverModule(name);
		}
		return this.knownModules[name];
	}

	/** узнать все, что можно о модуле, зная его имя */
	private async discoverModule(name: string): Promise<ModuleDescription>{
		let jsFilePath = await this.findModulePath(name);
		let code = (await fsReadFile(jsFilePath)).toString("utf8");
		let { dependencies } = evalModule(name, code);
		let minCode = this.needMinify? minifyJavascript(name, code): code;

		dependencies = dependencies
			.filter(dep => !specialDependencyNames.has(dep))
			.map(rawDep => ModuleName.resolve(name, rawDep));

		return { jsFilePath, code, minCode, dependencies }
	}
	
	/** найти путь к скомпиленному файлу модуля, имея его имя */
	private async findModulePath(name: string): Promise<string> {
		let moduleEndPath = this.nameToPathPart(name);

		let paths = (await Promise.all(this.outDirs.map(async outDir => {
			let fullModulePath = path.resolve(outDir, moduleEndPath);
			try {
				await fsStat(fullModulePath);
				return fullModulePath;
			} catch(e){
				// нету модуля. продолжаем искать в другой директории
				return null;
			}
		}))).filter(_ => !!_) as string[];

		if(paths.length < 1){
			throw new ModuleNotFoundError("Failed to find compiled file for module " + name);
		}

		if(paths.length > 1){
			// вообще, чем кидать эту ошибку, можно было бы попробовать...
			// ... просто снести все содержимое outDir (или хотя бы эти файлы) и запустить компиляцию по новой
			// потому что велика вероятность, что некоторые из этих файлов - результаты предыдущих сборок и не сгенерятся еще раз сами
			// но пока что я не уверен, насколько это правильно, и насколько нужно
			// если будет доставать эта ошибка - можно будет попробовать в этом направлении подумать
			throw new Error("There is more than one compiled file for module " + name + "; not sure which to use: " + paths.join("; "));
		}

		return paths[0];
	}

	/** функция для оповещения менеджера о том, что его знания об определенном модуле устарели */
	async invalidateModuleByPath(jsFilePath: string){
		if(jsFilePath.toLowerCase().endsWith(".tsbuildinfo"))
			return; // это инфа про билд, она регулярно обновляется и нам никак не нужна

		let name = this.pathToName(jsFilePath);
		if(!(name in this.knownModules))
			return;

		let mod = this.knownModules[name];
		// инвалидация сводится к удалению модуля из списка известных
		// при следующем обращении мы пойдем читать его заново
		delete this.knownModules[name];

		// тут мы проверяем, равен ли новый path модуля тому, о котором мы уже знаем
		// если не равен - известный нам файл нужно удалить с диска
		// чтобы не случалось странной ситуации, когда у нас одному ts-файлу соответствуют два js-файла
		// такое может быть, например, при перетаскивании модуля из одной корневой директории в другую
		// (строго говоря, если при этом тул не запущен - то ошибка все равно возникнет, но хотя бы иногда сделать с этим что-то надо)
		if(mod.jsFilePath !== path.resolve(jsFilePath)){
			logWarn("Detected module movement: " + mod.jsFilePath + " -> " + jsFilePath + "; deleting outdated file.");
			await fsUnlink(mod.jsFilePath);
		}
	}

	/** сконвертировать имя модуля в кусок пути к модулю
	 * имена модулей похожи на пути, но как есть их использовать не очень правильно,
	 * т.к. у модулей разделители кусков пути - всегда /, вне зависимости от ОС
	 */
	private nameToPathPart(name: string): string {
		return name.replace(/\//g, path.sep) + ".js";
	}

	/** сконвертировать путь к js-файлу модуля в имя модуля */
	private pathToName(modulePath: string): string {
		modulePath = path.resolve(modulePath);

		let includingDirs = this.outDirs.filter(outDir => pathIncludes(outDir, modulePath));
		
		if(includingDirs.length < 1){
			throw new Error("Compiled module file " + modulePath + " is not located in any expected output directories: " + this.outDirs.join("; "));
		}

		if(includingDirs.length > 1){
			// вот это вообще вряд ли случится, потому что мы раньше проверяем, что все outDirs-ы не вложены один в другой
			// но мало ли, лучше проверить еще раз
			throw new Error("Compiled module file " + modulePath + " is resolved ambiguously to output directories: " + includingDirs.join("; "));
		}

		let namePath = path.relative(includingDirs[0], modulePath).replace(/\.[jJ][sS]$/, "");
		return namePath.split(path.sep).join("/");
	}

	/** добыть из конфига список директорий, в которых будут генериться js-файлы */
	private extractSourcePathsFromConfig(tsConfigPath: string, outDir: string): readonly string[] {

		/** тут я очень сильно конкретизирую проверки того, что может быть в конфиге, а чего не может
		 * большая часть этих проверок связана с правильной генерацией путей в outDir
		 * и нужна затем, чтобы я мог однозначно сопоставить сгенерившиеся файлы с ts-модулями
		 * у меня есть смутное ощущение, что я теряю здесь какие-то возможности на тему использования внешних модулей
		 * но пока что у меня нет таких кейсов, соответственно, и потребности/понимания как это делать
		 * будут кейсы - можно будет пересматривать эти проверки (и, соответственно, еще много чего)
		 */

		let rawTscConfig = fs.readFileSync(tsConfigPath, "utf8");
		let config: TsConfig;
		try {
			config = JSON.parse(rawTscConfig);
		} catch(e){
			throw new Error("tsconfig.json (at " + tsConfigPath + ") is not valid JSON.");
		}
		if(!config.compilerOptions)
			throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected compilerOptions to be present.");
		if(config.compilerOptions.rootDir || config.compilerOptions.rootDirs)
			throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected no rootDir or rootDirs options to be present.");
		if(config.compilerOptions.baseUrl !== ".")
			throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected baseUrl option to be exactly \".\"");
		if(!config.compilerOptions.paths)
			throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected paths option to be present.");
		if(!config.compilerOptions.paths["*"])
			throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected paths option to have \"*\" wildcard value.");
		let rawPaths = config.compilerOptions.paths["*"];
		let tsconfigDir = path.dirname(tsConfigPath);
		let dirs = rawPaths.map(p => {
			if(!p.endsWith("*")){
				throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected all wildcard paths to end with wildcard (\"*\"), but this one is not: " + p);
			}
			let pathDir = path.dirname(p);

			// немного странная проверка, но смысл в следующем:
			// если в pathDir есть переход на уровень выше (т.е. выход за пределы . директории)
			// то, скорее всего, в outDir будет не совсем внятная каша
			// поэтому лучше проверять, что этого перехода нет. например, вот таким образом
			let fullPath = path.resolve(tsconfigDir, pathDir);
			if(!pathIncludes(tsconfigDir, fullPath) && tsconfigDir !== fullPath)
				throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected all wildcard paths to point to some dir inside project root (i.e. dir with tsconfig.json), but this one does not: " + p);
			return path.resolve(outDir, pathDir);
		});

		dirs = [...new Set(dirs)]; // удаляем полные дубли, ибо зачем они нам

		// проверяем, что корневые директории не вложены одна в другую. просто воизбежание хаоса
		for(let i = 0; i < dirs.length; i++){
			for(let j = i + 1; j < dirs.length; j++){
				if(pathIncludes(dirs[i], dirs[j]) || pathIncludes(dirs[j], dirs[i]))
					throw new Error("Could not use tsconfig.json (at " + tsConfigPath + "): expected all wildcard paths not to point into each other, but these two do: " + dirs[i] + "; " + dirs[j]);
			}
		}

		return dirs;
	}

	private _tslibCode: string | null = null;
	/** получить код tslib - библиотеки полифилла тайпскрипта
	 * либа особая, поэтому вынесена отдельно */
	async getTslib(): Promise<string> {
		if(!this._tslibCode){
			// берем тот tslib, который идет вместе с тулом
			// это нужно для того, чтобы не пришлось его инсталлить в каждом проекте
			let tslibPath = findBundlerOrProjectFile(this.tsconfigPath, "./node_modules/tslib/tslib.js");
			if(!tslibPath)
				throw new Error("Failed to found TSLib.");
			this._tslibCode = (await fsReadFile(tslibPath)).toString("utf8");
		}

		return this._tslibCode;
	}

}