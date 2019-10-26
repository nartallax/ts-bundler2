import * as fs from "fs";

export function fsStat(path: fs.PathLike, opts?: fs.BigIntOptions): Promise<fs.BigIntStats | fs.Stats> {
	return new Promise((ok, bad) => {
		let cb = (err: NodeJS.ErrnoException | null, res: fs.BigIntStats | fs.Stats) => {
			if(err){
				bad(err);
			} else {
				ok(res);
			}
		}
		try {
			opts? fs.stat(path, opts, cb): fs.stat(path, cb);
		} catch(e){
			bad(e);
		}
	})
}

export function fsReadFile(path: fs.PathLike | number, options?: { encoding?: null; flag?: string; } | null): Promise<Buffer> {
	return new Promise((ok, bad) => {
		try {
			fs.readFile(path, options, (err, res) => {
				err? bad(err): ok(res);
			});
		} catch(e){
			bad(e);
		}
	});
}

export function fsUnlink(path: fs.PathLike): Promise<void>{
	return new Promise((ok, bad) => {
		try {
			fs.unlink(path, err => err? bad(err): ok());
		} catch(e){
			bad(e);
		}
	});
}

export function fsWrite(path: fs.PathLike, data: Buffer): Promise<void>{
	return new Promise((ok, bad) => {
		try {
			fs.writeFile(path, data, err => err? bad(err): ok());
		} catch(e){
			bad(e);
		}
	});
}