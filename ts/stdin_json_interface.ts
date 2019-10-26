import {event} from "event";
import {logError} from "log";

export class StdinJsonInterface {

	onInput = event<any>();

	constructor(){
		let line = "";
		process.stdin.on("data", data => {
			line += data.toString("utf8");
			if(line.endsWith("\n")){
				let input: any;
				try {
					input = JSON.parse(line);
				} catch(e){
					logError("Could not parse JSON from stdin: " + line);
					return;
				} finally {
					line = "";
				}

				try {
					this.onInput.fire(input);
				} catch(e){
					logError("Failed to process stdin input: " + e.stack);
				}
			}
		});
	}

}