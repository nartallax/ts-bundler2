import * as path from "path";

// shamelessly copypasted from https://github.com/sindresorhus/is-path-inside

export function pathIncludes(parentPath: string, childPath: string){
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