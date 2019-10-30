import * as path from "path";
import * as fs from "fs";

let exists = (x: string) => {
	try {
		fs.statSync(x);
		return true;
	} catch(e){
		return false;
	}
}

export function findBundlerOrProjectFile(projectPath: string, relPath: string): string | null {
	let bundlerTsc = path.resolve(bundlerRoot, relPath);
	let projectTsc = path.resolve(path.dirname(projectPath), relPath)
	if(exists(bundlerTsc))
		return bundlerTsc;
	if(exists(projectTsc))
		return projectTsc;
	return null;
}

let bundlerRoot = __dirname;
export function setBundlerRoot(root: string){
	bundlerRoot = root;
}

export function getBundlerRoot(): string {
	return bundlerRoot;
}