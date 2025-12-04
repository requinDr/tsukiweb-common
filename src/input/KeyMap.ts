/**
 * Created by Loic France on 12/20/2016.
 */

import { RefObject, useEffect, useRef } from "react"
import { objectsEqual } from "../utils/utils"
import { NoMethods } from "../types"

type KeyMapCallback = (action: any, event: KeyboardEvent, ...args: any) => boolean|void
type KeyMapCondition = (action: any, event: KeyboardEvent, ...args: any) => boolean
type KeyAttr = 'key'|'code'|'keyCode'
export type KeyMapMapping = Record<string,
	KeymapKeyFilter | Array<KeyMapCondition | Omit<KeymapKeyFilter, KeyAttr> | KeymapKeyFilter>
>
type KeyboardEvents = 'keydown'|'keypress'|'keyup'

export type KeymapKeyFilter = ({
		code: string, key?: never
} | {
		key: string, code?: never
}) & {
	[KeyMap.condition]?: KeyMapCondition
	[KeyMap.args]?: any|Array<any>
	[KeyMap.editing]?: boolean
} & Partial<NoMethods<Omit<KeyboardEvent, KeyAttr>>> // other parameters to filter keyboard events (repeat, ctrlKey, etc)

export default class KeyMap {
	private mapping: Map<string, Array<{ keyEventFilter: KeymapKeyFilter, action: any }>>
	private callback: KeyMapCallback|null
	private keyListener: EventListener

	static readonly condition: unique symbol = Symbol("condition function to trigger action");
	static readonly args: unique symbol = Symbol("additional parameters on callback");
	static readonly editing: unique symbol = Symbol("if the event target is editable")

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
			const actions = this.getActions(event);
			for (let {keyEventFilter: filter, action} of actions) {
				if (this.callback(action, event, ...(filter[KeyMap.args] ?? []))) {
					event.preventDefault()
					break
				}
			}
		}
	}

	setMapping(mapping: KeyMapMapping) {
		this.clearMapping();
		for (const [action, evtFilter] of Object.entries(mapping)) {
			if (Array.isArray(evtFilter)) {
				let common = null
				for (let i = 0; i < evtFilter.length; i++) {
					let filter = evtFilter[i]
					if (typeof filter == "function") {
						if (i == 0)
							common = {[KeyMap.condition]: filter}
						else
							throw Error("Condition functions can only specified as the first element of the array")
					} else if (!Object.hasOwn(filter, 'key') && !Object.hasOwn(filter, 'code')) {
						if (i == 0)
							common = filter
						else
							throw Error("Common filters can only be specified in first element of the array (missing key or code)")
					} else {
						if (common?.[KeyMap.condition]) {
							if (KeyMap.condition in filter)
								throw Error("cannot accumulate global condition and local condition")
							filter = { ...common, ...filter }
						}
						this.setAction(filter as KeymapKeyFilter, action);
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

	private getActions(evt: KeyboardEvent) {
		let key = evt.key;
		const code = evt.code;

		if (/^[a-z]$/.test(key)) // one lowercase letter
			key = key.toUpperCase()

		let actions = this.mapping.get(code) || this.mapping.get(key);
		if (!actions)
			return []

		// filter actions based on conditions (specified function and event attributes)
		actions = actions.filter(({keyEventFilter: filter, action})=> {
			const attrs = Object.keys(filter) as Iterable<keyof KeymapKeyFilter>
			for (let attr of attrs) {
				if (filter[attr] != evt[attr as keyof typeof evt])
					return false
			}
			const condition = filter[KeyMap.condition]
			const args = filter[KeyMap.args] ?? []
			if (condition && !(condition(action, evt, ...args)))
				return false
			return true
		})
		// sort actions by number of constraints on the event
		actions = actions.sort(({keyEventFilter: filter1}, {keyEventFilter: filter2})=> {
			let weight1 = Object.keys(filter1).length
			let weight2 = Object.keys(filter2).length
			if (weight1 != weight2)
				return weight1 - weight2
			if (filter1[KeyMap.condition] || !filter2[KeyMap.condition])
				return -1
			return 1
		})
		return actions
	}
}

export function useKeyMap(mapping: KeyMapMapping|(()=>KeyMapMapping), callback: KeyMapCallback,
		target: GlobalEventHandlers|RefObject<GlobalEventHandlers|null|undefined>, 
		events: KeyboardEvents|KeyboardEvents[],
		options?: boolean|AddEventListenerOptions) {
	
	const keyMap = useRef<KeyMap>(undefined)
	
	useEffect(()=> {
		const _mapping = (typeof mapping == 'function') ? mapping() : mapping
		if (keyMap.current == undefined)
			keyMap.current = new KeyMap(_mapping, callback)
		else
			keyMap.current.setMapping(_mapping)
	}, [mapping])

	useEffect(()=> {
		if ('current' in target) {
			let current: GlobalEventHandlers|null|undefined = target.current
			if (!current)
				return
			target = current
		}
		keyMap.current!.enable(target, events, options)
		return keyMap.current!.disable.bind(keyMap.current, target, events, options)
	}, [target, events, options])
}