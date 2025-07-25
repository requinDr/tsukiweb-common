/**
 * Created by Loic France on 12/20/2016.
 */

import { RefObject, useEffect, useRef } from "react"
import { objectsEqual } from "./utils"
import { observe } from "./Observer"
import { NoMethods } from "../types"

type KeyMapCallback = (action: any, event: KeyboardEvent, ...args: any) => boolean|void
type KeyMapCondition = (action: any, event: KeyboardEvent, ...args: any) => boolean
export type KeyMapMapping = Record<string,
	KeymapKeyFilter|Array<KeymapKeyFilter|KeyMapCondition>
>
type KeyboardEvents = 'keydown'|'keypress'|'keyup'

export type KeymapKeyFilter = ({
		code: string
} | {
		key: string
}) & {
	[KeyMap.condition]?: KeyMapCondition
	[KeyMap.args]?: any|Array<any>
} & Partial<NoMethods<KeyboardEvent>> // other parameters to filter keyboard events (repeat, ctrlKey, etc)

export default class KeyMap {
	private mapping: Map<string, any>
	private callback: KeyMapCallback|null
	private keyListener: EventListener

	static readonly condition: unique symbol = Symbol("condition function to trigger action");
	static readonly args: unique symbol = Symbol("additional parameters on callback");

	constructor(mapping: KeyMapMapping|null = null, callback: KeyMapCallback|null = null) {
		this.mapping = new Map()
		this.callback = callback
		this.keyListener = this.listener_template.bind(this) as EventListener
		if (mapping)
			this.setMapping(mapping)
	}

	get onKeyEvent(): EventListener { // to use in "onClick = " expressions
		return this.keyListener
	}


	private listener_template(event: KeyboardEvent) {
		if (this.callback) {
			const result = this.getAction(event);
			const preventDefault = result ? this.callback(result.action, event, ...result.args) || false : false;
			if (preventDefault)
				event.preventDefault()
		}
	}

	setMapping(mapping: KeyMapMapping) {
		this.clearMapping();
		for (const [action, evtFilter] of Object.entries(mapping)) {
			if (Array.isArray(evtFilter)) {
				let condition = null
				for (let i = 0; i < evtFilter.length; i++) {
					let filter = evtFilter[i]
					if (typeof filter == "function") {
						if (i == 0)
							condition = filter
						else
							throw Error("a function is only possible on the first element of the array")
					} else {
						if (condition) {
							if (KeyMap.condition in evtFilter[i])
								throw Error("cannot accumulate global condition and local condition")
							filter = { ...(evtFilter[i] as KeymapKeyFilter), [KeyMap.condition]: condition }
						} else {
							filter = evtFilter[i] as KeymapKeyFilter
						}
						this.setAction(filter, action);
					}
				}
			} else {
				this.setAction(evtFilter, action);
			}
		}
	}

	setCallback(callback: KeyMapCallback|null) {
		this.callback = callback;
	}

	clearMapping() {
		this.mapping.clear();
	}

	enable(element: GlobalEventHandlers, events: string|string[],
			 options: boolean|AddEventListenerOptions|undefined = undefined) {

		if (element !== document && !(element as HTMLElement).hasAttribute('tabindex')) {
			(element as HTMLElement).setAttribute('tabindex', '-1'); // so it can receive keyboard events
		}
		if (Array.isArray(events)) {
			for (let event of events) {
				element.addEventListener(event, this.keyListener, options);
			}
		} else
			element.addEventListener(events, this.keyListener, options);
	};

	disable(element: GlobalEventHandlers, events: string|string[],
				options?: boolean|AddEventListenerOptions) {
		if (element !== document && (element as HTMLElement).getAttribute('tabindex') == '-1') {
			(element as HTMLElement).removeAttribute('tabindex');
		}
		if (Array.isArray(events)) {
			for (let event of events) {
				element.removeEventListener(event, this.keyListener, options);
			}
		} else
			element.removeEventListener(events, this.keyListener, options);
	};

	setAction = (keyEventFilter: KeymapKeyFilter, action: any = undefined)=> {
		const useCode = keyEventFilter.hasOwnProperty('code')
		const useKey = keyEventFilter.hasOwnProperty('key')
		if (useCode == useKey)
			throw Error("one and only one of the attrributes 'code' and 'key' must be defined");
		let id;
		if (useCode)
			id = keyEventFilter.code as string
		else {
			id = keyEventFilter.key as string
			if (/^[a-z]$/.test(id)) // one lowercase letter
				id = id.toUpperCase()
		}
		const actions = this.mapping.get(id);
		if (KeyMap.args in keyEventFilter && !Array.isArray(keyEventFilter[KeyMap.args])) {
			keyEventFilter[KeyMap.args] = [keyEventFilter[KeyMap.args]]
		}

		if (actions === undefined) {
			if (action)
				this.mapping.set(id, [{ keyEventFilter: keyEventFilter, action: action }]);
		}
		else {
			for (let i = 0; i < actions.length; i++) {
				if (objectsEqual(actions[i].keyEventFilter, keyEventFilter)) {
					if (action)
						actions[i].action = action;
					else
						actions.splice(i, 1);
					action = null
					break;
				}
			}
			if (action)
				actions.push({ keyEventFilter: keyEventFilter, action: action });
		}
	}

	private getAction(evt: KeyboardEvent) {
		let key = evt.key;
		const code = evt.code;

		if (/^[a-z]$/.test(key)) // one lowercase letter
			key = key.toUpperCase()

		let actions = this.mapping.get(code) || this.mapping.get(key);

		if (actions) {
			let maxAttrLen = 0; // filters with more constraints are prefered
			let result = undefined;
			let args = []
			for (let action of actions) {
				const filter = action.keyEventFilter;
				let attrLen = Object.keys(filter).length; // constraints number, without [KeyMap.condition]
				const condition = filter[KeyMap.condition];
				if (condition)
					attrLen+=0.5 // condition function not as important as event attributes
				if (attrLen > maxAttrLen) {
					const filteredEvt = {
						...Object.fromEntries(Object.keys(filter).map(k=>[k,evt[k as keyof typeof evt]])),
						key // override event key
					} as typeof filter
					if (!Object.entries(filter).some(([k,v])=>(filteredEvt[k] != v))
							&& (condition?.(action, evt, ...(filter?.[KeyMap.args]??[]))??true)) {
						maxAttrLen = attrLen;
						result = action.action;
						args = filter?.[KeyMap.args]??[]
					}
				}
			}
			if (result) {
				return { action: result, args: args };
			}
		}
		return undefined;
	}
}

export function useKeyMap(mapping: KeyMapMapping|(()=>KeyMapMapping), callback: KeyMapCallback,
		target: GlobalEventHandlers|RefObject<GlobalEventHandlers|null|undefined>, 
		events: KeyboardEvents|KeyboardEvents[],
		options?: boolean|AddEventListenerOptions) {
	
	const keyMap = useRef<KeyMap>(undefined)
	
	useEffect(()=> {
		if (keyMap.current == undefined)
			keyMap.current = new KeyMap(null, callback)
	}, [])

	useEffect(()=> {
		if (mapping.constructor == Function)
			keyMap.current!.setMapping((mapping as Function)())
		else
			keyMap.current!.setMapping(mapping as KeyMapMapping)
	}, [mapping])

	useEffect(()=> {
		if ('current' in target) {
			let current: GlobalEventHandlers|null|undefined = target.current
			observe(target, 'current', (node)=> {
				if (current) {
					keyMap.current!.disable(current, events, options)
				}
				if (node) {
					keyMap.current!.enable(node, events, options)
				}
				current = node
			})
			return ()=> {
				if (current) {
					keyMap.current!.disable(current, events, options)
				}
			}
		} else {
			keyMap.current!.enable(target, events, options)
			return keyMap.current!.disable.bind(keyMap, target, events, options)
		}
	}, [target, events, options])
}