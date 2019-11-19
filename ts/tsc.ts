import * as path from "path";
import {event} from "event";
import * as childProcess from "child_process";
import {EventEmitter} from "events";
import {logError, logDebug, logInfo} from "log";
import {findBundlerOrProjectFile} from "bundler_or_project_file";

export interface TscOptions {
	projectPath: string;
	outDir: string;
	target: "es5" | "es2018";
	watch: boolean;
}

export interface TscIncrementalCompilationResult {
	filesChanged: string[];
	success: boolean;
}

function waitEventOnce<T = void>(obj: EventEmitter, evtName: string): Promise<T>{
	return new Promise(ok => obj.once(evtName, ok))
}

export class TSC {

	private readonly tscPath: string;
	private readonly opts: TscOptions;

	constructor(opts: TscOptions){
		this.opts = opts;
		this.tscPath = this.findTsc();
	}

	private findTsc(): string{
		let path = findBundlerOrProjectFile(this.opts.projectPath, "./node_modules/typescript/bin/tsc");
		if(!path)
			throw new Error("Could not find tsc executable.");
		return path;
	}

	/** показывает, производится ли компиляция в данный момент. значение имеет смысл только в watch-режиме */
	get isRunning(): boolean {
		return !!this._runningCount;
	}
	private _runningCount = 0;

	/** показывает, успешна ли последняя компиляция или нет. значение имеет смысл только в watch-режиме */
	get codeBroken(): boolean {
		return this._codeBroken;
	}
	private _codeBroken = false;

	/** событие, происходящее после завершения каждой компиляции в watch-режиме */
	readonly afterCompilationRun = event<TscIncrementalCompilationResult>();

	private lastCompilationFileChanges: string[] = [];

	private generateTscArguments(opts: TscOptions): string[] {
		return [
			"--project", opts.projectPath,
			"--outDir", opts.outDir,
			"--rootDir", path.dirname(opts.projectPath),
			"--target", opts.target,
			"--module", "AMD",
			"--moduleResolution", "Node",
			"--importHelpers",
			"--noEmitHelpers",
			"--incremental",
			!opts.watch? "": "--watch",
			!opts.watch? "": "--listEmittedFiles",
		].filter(_ => !!_);
	}

	async run(){
		let opts = this.opts;
		if(!opts.watch){
			let proc = this.createProcess(opts);

			// прокидываем вывод компилятора в наш stderr
			// возможно, когда-нибудь это будет мешать, но пока что нет
			proc.stderr.on("data", data => console.error(data.toString("utf8")));
			proc.stdout.on("data", data => console.error(data.toString("utf8")));
			let exitCode = await waitEventOnce<number | null>(proc, "exit");
			if(exitCode !== 0){
				throw new Error("TSC exited with code " + exitCode);
			}
		} else {
			let proc = this.createProcess(opts);
			proc.stdout.on("data", data => {
				(data.toString("utf8") as string)
					.split("\n")
					.forEach(line => this.processWatchLine(line))
			});
			proc.stderr.on("data", data => console.error(data.toString("utf8")));

			// кажется, в норме этого никогда не должно случиться?
			// потому что, по нашей идеологии, tsc в watch-режиме завершается только при завершении процесса в целом
			// поэтому, если tsc упал, случилась какая-то странная хрень и нужно кинуть ошибку
			let exitCode = await waitEventOnce<number | null>(proc, "exit");
			throw new Error("TSC in watch mode unexpectedly exited with code " + exitCode);
		}

	}

	private processWatchLine(line: string){
		let lc = line.toLowerCase().replace("\u001bc", "").trim();

		line = line.replace("\u001bc", "").trim();

		if(lc.startsWith("tsfile: ")){
			this.lastCompilationFileChanges.push(line.substr("tsfile: ".length).trim());
		} else if(lc.match(/^[\d:\-\s]+starting\s+compilation\s+in\s+watch\s+mode/) || lc.match(/^[\d:\-\s]+file\s+change\s+detected/)){
			this.startRunning();
		} else if(lc.match(/^[\d:\-\s]+found\s+0\s+errors/)){
			this.stopRunning(true);
		} else if(lc.match(/^[\d:\-\s]+found\s+\d+\s+error/)){
			this.stopRunning(false);
		} else if(line.trim()) {
			// наверняка сообщение об ошибке. прокидываем в наш stderr
			console.error(line);
		}
	}

	private startRunning(){
		if(this.lastCompilationFileChanges.length > 0 && !this.isRunning){
			// никогда не должно произойти. просто на всякий случай проверим
			throw new Error("Something strange happened (duplicate compilation start?)");
		}
		this._runningCount++;
		//logInfo("Run started: " + this._runningCount);
	}

	private stopRunning(success: boolean){
		this._runningCount--;
		//logInfo("Run completed: " + this._runningCount);
		if(this.isRunning)
			return; // двойной запуск компиляции. неприятно, но ладно, не реагируем
		this._codeBroken = !success;
		let data: TscIncrementalCompilationResult = { 
			filesChanged: this.lastCompilationFileChanges,
			success
		};
		this.lastCompilationFileChanges = [];
		this.afterCompilationRun.fire(data);
	}

	private createProcess(opts: TscOptions) {
		let args = this.generateTscArguments(opts);
		logDebug("CLI args: " + JSON.stringify([this.tscPath, ...args]));
		let proc = childProcess.spawn(this.tscPath, args, {
			cwd: path.dirname(opts.projectPath),
			windowsHide: true
		});
		proc.on("error", e => logError("TSC process errored: " + e.message));
		return proc;
	}


}