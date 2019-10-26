/** функции для манипуляции с именами модулей */
export const ModuleName = {

	normalize(name: string): string{
		let x = name;
		let xx = x;
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
	},

	resolve(base: string, name: string): string {
		return name.charAt(0) !== "."? name: this.join(this.dirname(base), name)
	},

	join(...args: string[]): string {
		let result = args.map((arg, i) => {
			if(i !== 0)
				arg = arg.replace(/^\//, "");
			if(i !== args.length -1)
				arg = arg.replace(/\/$/, "");
			return arg;
		}).filter(_ => !!_);
		return this.normalize(result.join("/"));
	},

	dirname(name: string): string {
		return name.replace(/\/?[^\/]+$/, "");
	}



}