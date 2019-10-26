/** функция, исполняющая код модуля и возвращающая список его зависимостей
 * эта функция вынесена в отдельный модуль из соображений безопасности
 */
export function evalModule(name: string, code: string): { dependencies: string[] }{
	let dependencies = null as string[] | null;
	let define = (deps: string[]) => {
		if(dependencies)
			throw new Error("Double define() call from definition of module " + name);
		dependencies = deps;
	}
	void define; // предполагается, что он будет вызван изнутри code. а эта строчка нужна для успокоения компилятора
	eval(code);
	if(!dependencies)
		throw new Error("No define() call from definition of module " + name);
	return { dependencies };
}