import { directionalNavigate } from "./arrowNavigation"
import { EventFilter, useEventActions } from "./eventActions"
import { useRef, RefObject, useEffect, useCallback } from "react"

const backMap = new Map<Node, VoidFunction>()

function handleBack(source: Node|null) {

	while (source && source != document.body && !backMap.has(source)) {
		source = source.parentNode
	}
	if (source == document)
		source = document.body
	const back = backMap.get(source ?? document.body)
	if (!back)
		return false
	back()
	return true
}

function callback(action: string, evt: KeyboardEvent, ...args: any) {
	switch (action) {
		case "nav" : 
			const handled = directionalNavigate(args[0])
			if (!handled && args[0] == "out") {
				return handleBack(document.activeElement)
			}
			return handled
		case "none":
			return true
		default :
			throw Error(`Unknown action ${action}`)
	}
}

export const useArrowNavigation = (binding: Record<'nav', EventFilter[]>) =>
	useEventActions(binding, callback, document, {capture: true})


export function registerBack(root: Node, callback: VoidFunction) {
	backMap.set(root, callback)
}
export function unregisterBack(root: Node) {
	backMap.delete(root)
}

export function useNavBackRef<T extends Node>(back: VoidFunction,
		refObj: RefObject<T|null> = useRef(null)) {

	const callback = useCallback((node: T|null)=> {
		if (node)
			backMap.set(node, back)
		else if (refObj.current)
			backMap.delete(refObj.current)
		refObj.current = node
	}, [])
	return callback
}

export const useDefaultNavBack = (back: VoidFunction)=> {
	useEffect(()=> {
		backMap.set(document.body, back)
		return ()=> {
			backMap.delete(document.body)
		}
	}, [back])
}