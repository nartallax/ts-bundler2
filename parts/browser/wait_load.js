(function(cb){
	var interval = null;
	var loaded = false;
	
	var wcb = function(){
		if(loaded)
			return;
		loaded = true;
		if(interval)
			clearInterval(interval);
		cb();
	}
	
	var checkState = function(){
		if(document && (document.readyState === "interactive" || document.readyState === "complete"))
			wcb();
	}
	
	window.addEventListener("load", wcb);
	document.addEventListener("load", wcb);
	document.addEventListener("readystatechange", checkState);
	interval = setInterval(checkState, 10);
	checkState();
})