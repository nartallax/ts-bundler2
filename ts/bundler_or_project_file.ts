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
	let bundlerTsc = path.resolve(__dirname, relPath);
	let projectTsc = path.resolve(path.dirname(projectPath), relPath)
	if(exists(bundlerTsc))
		return bundlerTsc;
	if(exists(projectTsc))
		return projectTsc;
	return null;
}