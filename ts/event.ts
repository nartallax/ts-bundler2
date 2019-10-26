type Listener<T> = (args: T) => void;

export interface IEvent<T = void>{
	(listener: Listener<T>): void;
	once(listener: Listener<T>): void;
	unsubscribe(listener: Listener<T>): void;
	fire(args: T): void;
}

export function event<T = void>(): IEvent<T>{
	let listeners = new Map<Listener<T>, { fn: Listener<T>, once?: boolean }>();
	
	let result: any = (listener: Listener<T>) => { listeners.set(listener, { fn: listener }) }
	result.unsubscribe = (listener: Listener<T>) => { listeners.delete(listener) }
	result.fire = (args: T) => listeners.forEach(_ => {
		_.fn(args);
		if(_.once)
			listeners.delete(_.fn);
	});
	result.once = (listener: Listener<T>) => { listeners.set(listener, { fn: listener, once: true }) }
	return result;
}