/** код в этом файле нужен, чтобы запускать сам бандлер
 * вручную его запускать не нужно никогда, он подклеивается к результату компиляции самого бандлера в compile.sh
 */

let define = (() => {
	setTimeout(async () => {
		try {
			let mainPackageName = "main";
			let mainFunctionName = "main";
			await Promise.resolve(resolve(mainPackageName)[mainFunctionName].call(null));
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

