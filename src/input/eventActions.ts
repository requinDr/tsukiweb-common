
import { RefObject, useEffect, useRef } from "react"
import { NoMethods } from "../types"
import { objectMatch } from "../utils/utils"

type EventType = (keyof HTMLElementEventMap)|string
type EventFromType<T extends EventType> = T extends keyof HTMLElementEventMap ? HTMLElementEventMap[T] : any

export type EventFilter<A extends any = any, ET extends EventType = string, E extends Event = EventFromType<ET>, T extends Array<any> = any> = {
	[EventActions.IF]?: (action: A, event: E, ...args: T) => boolean
	[EventActions.ARGS]?: T,
    type: ET
} & Partial<NoMethods<E>>

type ActionCallback<A, E> = (action: A, event: E, ...args: any) => boolean|void

const ACTION = Symbol("Action")
const SIZE = Symbol("filter size")

type Opts = {
    hideTextEdit?: boolean
}

function isEditableElement(el: EventTarget|null) {
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el instanceof HTMLInputElement) {
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#input_types
    if (/text|email|number|password|search|tel|url/.test(el.type)) {
      return !(el.disabled || el.readOnly);
    }
  }
  else if (el instanceof HTMLTextAreaElement) return !(el.disabled || el.readOnly);
  return false;
}

export class EventActions<A = string> {
	static readonly IF: unique symbol = Symbol("condition function to trigger action");
	static readonly ARGS: unique symbol = Symbol("additional parameters on callback");
    /**
     * Map event types to filters and action
     * Add filter size (length of object keys) in the structure to sort actions
     */
    private _eventsMap : Map<string, ({[ACTION]: A, [SIZE]: number} & EventFilter<A, any>)[]>
    private _callback: ActionCallback<A, any>
    private _hideTextEdit: boolean

    constructor(callback: ActionCallback<A, any>, opts: Opts = {}) {
        this._eventsMap = new Map()
        this._callback = callback
        this.handleEvent = this.handleEvent.bind(this) // allow using attribute in addEventlistener
        const {hideTextEdit = true} = opts
        this._hideTextEdit = hideTextEdit
    }
    
    get usedEvents() {
        return this._eventsMap.keys()
    }

    get hideTextEdit() { return this._hideTextEdit }
    set hideTextEdit(value: boolean) {
        this._hideTextEdit = value
    }

    addAction<T extends EventType, E extends EventFromType<T>>(action: A, filter: EventFilter<A, T, E>) {
        const size = Object.keys(filter).length
        const f = {[ACTION]: action, [SIZE]: size, ...filter}
        const filters = this._eventsMap.get(filter.type)
        if (filters)
            filters.push(f)
        else
            this._eventsMap.set(filter.type, [f])
    }

    clearActions() {
        this._eventsMap.clear()
    }

    handleEvent(evt: Event) {
        if (evt instanceof KeyboardEvent && this._hideTextEdit && isEditableElement(evt.target))
            return
        // take only filters that match the event, and sort them with most specific match first
        const filters = this._eventsMap.get(evt.type)
                ?.filter(f=> objectMatch(evt, f, false))
                .sort((f1, f2)=> f2[SIZE] - f1[SIZE])
        if (!filters || filters.length == 0)
            return
        for (const filter of filters) {
            const action = filter[ACTION]
            const args = filter[EventActions.ARGS] ?? []
            if (filter[EventActions.IF]?.(action, evt, ...args) ?? true) {
                if (this._callback(action, evt, ...args)) {
                    evt.preventDefault()
					evt.stopImmediatePropagation()
					break // don't execute other actions if first one validates it.
                }
            }
        }
    }
    
    dispatchAction(action: A, evt: Event|undefined = undefined, ...args: any) {
        this._callback(action, evt, ...args)
    }

    enable(element: GlobalEventHandlers,
           eventTypes: Iterable<EventType> = this.usedEvents,
           opts?: boolean|AddEventListenerOptions) {
        for (const evtType of eventTypes) {
            element.addEventListener(evtType, this.handleEvent, opts)
        }
    }

    disable(element: GlobalEventHandlers,
            eventTypes: Iterable<EventType> = this.usedEvents,
            opts?: boolean|AddEventListenerOptions) {
        for (const evtType of eventTypes) {
            element.removeEventListener(evtType, this.handleEvent, opts)
        }
    }
}

type Mapping = {
    [A in string]: EventFilter<A>[]
}

type Callback<M extends Mapping> = <A extends keyof M>(
    action: A,
    event: EventFromType<M[any][any]['type']>,
    ...args: any[]
) => boolean|void

export function useEventActions<M extends Mapping>(
        mapping: M|(()=>M),
        callback: Callback<M>,
        target: GlobalEventHandlers|RefObject<GlobalEventHandlers|null|undefined>,
		options?: boolean|(Opts & AddEventListenerOptions),
        enabled = true
    ) {
    const handler = useRef<EventActions>(undefined)
    
	useEffect(()=> {
		const _mapping = (typeof mapping == 'function') ? mapping() : mapping
		if (handler.current == undefined)
			handler.current = new EventActions(callback, typeof options == 'object' ? options : {})
		else {
            for (const [action, filters] of Object.entries(_mapping)) {
                for (const filter of filters)
                    handler.current.addAction(action, filter)
            }
        }
        return ()=> {
            handler.current?.clearActions()
        }
	}, [mapping, options])

	useEffect(()=> {
        if (!enabled)
            return
		if ('current' in target) {
			let current: GlobalEventHandlers|null|undefined = target.current
			if (!current)
				return
			target = current
		}
        const evts = handler.current!.usedEvents
		handler.current!.enable(target, evts, options)
		return handler.current!.disable.bind(handler.current, target, evts, options)
	}, [target, mapping, options, enabled])
}