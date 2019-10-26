(function(entryPoint, entryFunction, packageCode, waitLoad, onPackageNotFound){
	"use strict";

	function modNormalize(name){
		var x = name, xx;
		while(true){
			xx = x.replace(/[^\/]+\/\.\.\//g, "");
			if(xx.length === x.length)
				break;
			x = xx;
		}
		while(true){
			xx = x.replace(/\.\//g, "");
			if(xx.length === x.length)
				break;
			x = xx;
		}
		return x;
	}

	function modDirname(name){
		return name.replace(/\/?[^\/]+$/, "");
	}

	function modJoin(){
		var result = [];
		for(var i = 0; i < arguments.length; i++){
			var x = arguments[i];
			(i === 0) || (x = x.replace(/^\//, ""));
			(i === arguments.length - 1) || (x = x.replace(/\/$/, ""));
			x && result.push(x);
		}
		return modNormalize(result.join("/"));
	}

	function resolveModuleName(base, name){
		return name.charAt(0) !== "."? name: modJoin(modDirname(base), name)
	}

	var knownPackages = {
		require: function(name){
			return onPackageNotFound(name);
		}
	}

	function run(){
		var currentPackage = null;

		if("tslib" in packageCode){
			(function(){
				var global = {};
				var window = global;
				var self = global;
				eval(packageCode.tslib);
				if(typeof(global.__awaiter) !== "function"){
					throw new Error("TSLib corrupted.");
				}
				knownPackages.tslib = global;
			})();
		}
		
		function define(reqs, fn){
			var name = currentPackage;
			var pkgs = [];
			var result = null;
			for(var i = 0; i < reqs.length; i++){
				var r = resolveModuleName(name, reqs[i]);
				pkgs.push(r === "exports"? (result = {}): getPackage(r));
			}
			fn.apply(null, pkgs);
			knownPackages[name] = result;
		}
		define.amd = true;

		function getPackage(name){
			if(name in knownPackages)
				return knownPackages[name];
			var code = packageCode[name];
			if(!code)
				return onPackageNotFound(name);
			currentPackage = name;
			try {
				eval(code + "\n//# sourceURL=" + name)
			} catch(e){
				if(typeof(packageEvalExceptionHandler) !== "undefined"){
					packageEvalExceptionHandler(e, name);
				}
				throw e;
			}
			
			return knownPackages[name];
		}

		getPackage(entryPoint)[entryFunction].call(null);
	}
	
	waitLoad(run);
})