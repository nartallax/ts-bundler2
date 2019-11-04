import {ModuleManager, ModuleDescription, ModuleNotFoundError} from "module_manager";
import {logWarn, logDebug} from "log";


/** класс, предназначенный для получения дерева зависимостей */
export class DependencyTraverser {

	private readonly modman: ModuleManager;
	private readonly modSet = new OrderedSet<string>();
	private readonly knownAbsentModules = new Set<string>();

	constructor(modman: ModuleManager){
		this.modman = modman;
	}


	/** получить полный список зависимостей указанного модуля (включая этот же модуль) */
	async getTransitiveDependenciesFor(name: string): Promise<Set<string>> {
		logDebug("Starting dependency traversing.");
		
		this.modSet.clear();
		this.knownAbsentModules.clear();
		let result = new Set<string>();
		await this.getTransitiveDependencyListRecursive(name, result);
		if(this.knownAbsentModules.size > 0){
			logWarn("Assuming following modules to be provided: " + [...this.knownAbsentModules].join(", "));
		}

		logDebug("Done traversing dependencies; full list of dependencies is " + result.size + " entries long.");
		return result;
	}

	private async getTransitiveDependencyListRecursive(name: string, result: Set<string>): Promise<void> {
		if(this.knownAbsentModules.has(name)){
			return;
		}

		logDebug("Starting to resolve dependencies of " + name)

		if(this.modSet.has(name)){
			let seq = [...this.modSet.asArray()];
			while(seq.length > 0 && seq[0] !== name){
				seq = seq.slice(1);
			}
			seq.push(name);
			throw new Error("Circular dependency detected: " + seq.join(" -> "));
		}

		if(result.has(name)){
			return;
		}

		if(name === "tslib"){ // специальная либа
			result.add(name);
			return;
		}

		let mod: ModuleDescription;
		try {
			mod = await this.modman.getModule(name);
		} catch(e){
			if(e instanceof ModuleNotFoundError){
				logDebug("Known absent module found: " + name);
				this.knownAbsentModules.add(name);
			}
			return;
		}

		result.add(name);
		this.modSet.push(name);
		//logDebug("Added module to dependency list: " + name + "; " + this.modSet.asArray().join(" -> "));
		try {
			//logDebug("Dependencies of " + name + " are " + mod.dependencies.join(", "));
			for(let dep of mod.dependencies){
				await this.getTransitiveDependencyListRecursive(dep, result);
			}
			//logDebug("Resolved all dependencies of " + name);
		} finally {
			//logDebug("Done with module " + name);
			this.modSet.pop(name);
		}
	}

}

class OrderedSet<T>{
	private arr: T[] = [];
	private set: Set<T> = new Set();

	clear(){
		this.arr = [];
		this.set = new Set();
	}

	push(v: T){
		this.arr.push(v);
		this.set.add(v);
	}

	pop(v: T){
		if(this.arr[this.arr.length - 1] !== v)
			throw new Error("Incorrect push/pop order: expected " + this.arr[this.arr.length - 1] + ", got " + v);
		this.arr.pop();
		this.set.delete(v)
	}

	has(v: T){
		return this.set.has(v);
	}

	asArray(): readonly T[]{
		return this.arr;
	}
}