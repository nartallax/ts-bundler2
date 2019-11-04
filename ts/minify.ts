import * as UglifyJS from "uglify-js";
import {logWarn, logError} from "log";

/** обертка для некоего минификатора кода, который использует тул */
export function minifyJavascript(name: string, code: string): string {

	// все эти опции передаются с одной целью
	// выпилить однозначно излишнюю хрень (комменты, отступы и т.д.)
	// и при этом не угробить вконец дебагабельность. например, я оставляю имена, потому что хочу иметь нормальные стектрейсы
	// если что-то излишне гробит дебагабельность - это что-то нужно выключить
	let result = UglifyJS.minify(code, {
		compress: true,
		ie8: true,
		keep_fnames: true,
		mangle: false, 
		warnings: false, // false - потому что ворнингов обычно сильно дохера, и о простых вещах
		toplevel: false,
		output: {
			comments: false,
			beautify: false,
			max_line_len: 1024,
			preserve_line: false
		}
	});

	result.warnings && result.warnings.forEach(warning => {
		logWarn("Minifier warning for " + name + ": " + warning);
	});

	if(result.error){
		logError("Minifier error for " + name + ": " + result.error);
		throw new Error("Minifier error for " + name + ": " + result.error);
	}

	return result.code;
}