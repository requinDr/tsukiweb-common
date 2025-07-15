import { RecursivePartial, JSONObject, JSONPrimitive, JSONParent, PartialJSON, JSONDiff, JSONMerge } from "@tsukiweb-common/types"
import { ReactElement, ReactNode, SyntheticEvent, useEffect } from "react"

//##############################################################################
//#                            OBJECTS MANIPULATION                            #
//##############################################################################

export function objectMatch<T extends Record<PropertyKey, any>>(toTest: T, ref: RecursivePartial<T>, useSymbols=true): boolean {
	const props = [
			...Object.getOwnPropertyNames(ref),
			...(useSymbols ? Object.getOwnPropertySymbols(ref) : [])]
	for(const p of props) {
		if (!(p in toTest))
			return false
		if(ref[p] !== toTest[p]) {
			const refType = ref[p]?.constructor
			if (refType != toTest[p]?.constructor)
				return false
			if (refType != Object && refType != Array)
				return false
			if (!objectMatch(toTest[p], ref[p] as Exclude<typeof ref[typeof p], undefined>, useSymbols))
				return false
		}
	}
	return true;
}

export function objectsEqual(obj1: Record<PropertyKey, any>, obj2: Record<PropertyKey, any>, useSymbols=true) {
	return objectMatch(obj1, obj2, useSymbols) && objectMatch(obj2, obj1, useSymbols)
}

const primitiveTypes = [String, Number, BigInt, Symbol, Boolean, null, undefined] as Array<Function|null|undefined>

function isPrimitive(v: any) : v is string|number|BigInt|Symbol|boolean|null|undefined {
	return primitiveTypes.includes(v?.constructor)
}
export function deepAssign<Td extends Record<string,any>, Ts extends Td>(dest: Readonly<Td>, src: Readonly<Ts>,
	opts: {extend?: true, morphTypes?: true, clone: true}): Ts
export function deepAssign<Td extends Record<string,any>, Ts extends RecursivePartial<Td>>(dest: Readonly<Td>, src: Readonly<Ts>,
	opts: {extend?: boolean, morphTypes?: boolean, clone: true}): Td
export function deepAssign<Td extends Record<string,any>, Ts extends Td>(dest: Td, src: Readonly<Ts>,
	opts?: {extend?: true, morphTypes?: true, clone?: false}): Ts; // Td ⊂ Ts
export function deepAssign<Td extends Record<string, any>, Ts = RecursivePartial<Td>>(dest: Td, src: Readonly<Ts>,
	opts?: {extend?: boolean, morphTypes: false, clone?: false}): Td; // Td ⊃ Ts
export function deepAssign<Td extends Record<string,any>, Ts extends Record<string, any>>(dest: Td, src: Readonly<Ts>,
	opts: {extend: false, morphTypes: false, clone?: false}): Td; // only update values
export function deepAssign<Td extends Record<string,any>, Ts extends Record<keyof Td, Ts[keyof Td]>>(dest: Td, src: Readonly<Ts>,
	opts: {extend: false, morphTypes?: true, clone?: false}): {[K in keyof Td] : Ts[K]}; // update values and types
//TODO add types for clean = true
export function deepAssign<Td extends Record<string,any>, Ts extends Record<string, any>>(dest: Td, src: Readonly<Ts>,
	opts?: {extend?: boolean, morphTypes?: boolean, clone?: boolean, clean?: boolean}): Record<string, any>

export function deepAssign<Td extends Record<string,any>, Ts extends Record<string, any>>(dest: Td, src: Readonly<Ts>,
		{extend = true, morphTypes = true, clone = false, clean = false} = {}): Record<string, any> {
	const res = clone ? {} : dest as Record<string, any>
	for (const p of Object.getOwnPropertyNames(src)) {
		let create = false
		let exists = Object.hasOwn(dest, p)
		const srcType = src[p]?.constructor
		if (!exists)
			create = extend
		else
			create = morphTypes && srcType != dest[p]?.constructor
		if (create) {
			if (isPrimitive(src[p]))
				res[p] = src[p]
			else if (srcType == Object)
				res[p] = deepAssign({}, src[p])
			else if (srcType == Array)
				res[p] = src[p].slice(0, src[p].length)
			else
				throw Error(`cannot deep-assign ${p as string}:${srcType}`)
		} else if (exists) {
			if (isPrimitive(src[p])) {
				res[p] = src[p]
			} else if (srcType == Object)
				res[p] = deepAssign(dest[p], src[p] as any, {extend, morphTypes, clone, clean})
			else if (srcType == Array) {
				if (clone)
					res[p] = Array.from(src[p])
				else
					dest[p].splice(0, dest[p].length, ...(src[p] as Array<any>))
			}
			else
				throw Error(`cannot deep-assign ${p as string}:${srcType}`)
		}
	}
	if (clone && !clean) {
		for (const p of Object.getOwnPropertyNames(dest)) {
			if (!Object.hasOwn(src, p)) {
				if (isPrimitive(dest[p]))
					res[p] = dest[p]
				else if (Array.isArray(dest[p]))
					res[p] = Array.from(dest[p])
				else if (dest[p]?.constructor == Object)
					res[p] = deepAssign({}, dest[p], {extend: true, morphTypes, clone: false})
				else
					throw Error(`cannot clone ${p as string}:${dest[p].constructor}`)
			}
		}
	}
	else if (clean && !clone) {
		for (const p of Object.getOwnPropertyNames(dest)) {
			if (!Object.hasOwn(src, p)) {
				delete res[p]
			}
		}
	}
	return res
}

export function deepFreeze<T extends Record<PropertyKey, any>>(object: T): Readonly<T> {
	const props = Reflect.ownKeys(object)
	for (const p of props) {
		const value = object[p]
		if (value && ["object", "function"].includes(typeof value))
			deepFreeze(value)
	}
	return Object.freeze(object)
}

export function jsonDiff<T1 extends PartialJSON, T2 extends PartialJSON<T1>>(
	obj: T1, ref: Readonly<T2>): JSONDiff<T1, T2> {
	const result: PartialJSON = {}
	for (const p of Object.keys(obj)) {
		if (!Object.hasOwn(ref, p) || ref[p] === undefined)
			result[p] = structuredClone(obj[p])
		else if (obj[p] == ref[p])
			continue
		else if (isPrimitive(obj[p]))
			result[p] = obj[p]
		else if (Array.isArray(obj[p])) {
			const refArray = ref[p] as any[]
			const objArray = obj[p] as any[]
			if (objArray.length != refArray.length ||
					objArray.some((v, i) => v != refArray[i])) {
				result[p] = Array.from(objArray)
			}
		} else {
			const val = jsonDiff(obj[p], ref[p] as PartialJSON)
			if (Object.keys(val).length > 0)
				result[p] = val
		}
	}
	return result as JSONDiff<T1, T2>
}

export function jsonMerge<T1 extends PartialJSON, T2 extends PartialJSON>(
	dest: T1, src: T2, {inplace = false, override = false} = {}) : JSONMerge<T1, T2> {
	const result = inplace ? dest : structuredClone(dest)
	for (const p of Object.keys(src) as (keyof T1)[]) {
		const value = src[p] as unknown as T1[typeof p]
		if (!Object.hasOwn(dest, p) || dest[p] === undefined) {
			result[p] = structuredClone(value)
		} else {
			const currValue = result[p]
			if (currValue == value)
				continue
			else if (isPrimitive(currValue)) {
				if (override) result[p] = value
			} else if (Array.isArray(currValue)) {
				if (override) {
					if (isPrimitive(value))
						result[p] = value
					if (Array.isArray(value)) {
						if (value.length != currValue.length
							|| (currValue as any[]).some((v, i) => v != value[i]))
							result[p] = structuredClone(value)
					} else
						result[p] = structuredClone(value)
				}
			} else {
				jsonMerge(currValue, value as JSONObject, {override, inplace:true})
			}
		}
	}
	return result as unknown as JSONMerge<T1, T2>
}

//##############################################################################
//#                              TEXT CONVERSION                               #
//##############################################################################

export function preprocessText(text: string) {
	let m
	let result = ""
	while ((m = /[-―─―]{2,}/g.exec(text)) !== null) {
		if (m.index > 0)
			result += text.substring(0, m.index)
		const len = m[0].length
		result += `[line=${len}/]`
		text = text.substring(m.index + len)
	}
	if (text.length > 0)
		result += text
	return result
}

export function innerText(jsx: ReactNode): string {
	switch (typeof jsx) {
		case null :
		case 'undefined' :
		case 'boolean' : return ''
		case 'number' : return (jsx as number).toString()
		case 'string' : return jsx as string
		default :
			if (Array.isArray(jsx))
				return (jsx as Array<ReactNode>).reduce<string>((str, node)=>str + innerText(node), "")
			if ((jsx as ReactElement<{ children?: React.ReactNode }>).props.children) {
				return innerText((jsx as ReactElement<{ children?: React.ReactNode }>).props.children)
			}
			return ""
	}
}

export function splitFirst(text: string, sep: string, position=0) : [string, string|null] {
	const i = text.indexOf(sep, position)
	if (i >= 0)
		return [text.substring(0, i), text.substring(i+1)]
	else
		return [text, null]
}

export function splitLast(text: string, sep: string, position=text.length) : [string, string|null] {
	const i = text.lastIndexOf(sep, position)
	if (i >= 0)
		return [text.substring(0, i), text.substring(i+1)]
	else
		return [text, null]
}

export function subTextCount(full: string, sub: string) : number {
		if (sub.length <= 0) return (full.length + 1)
		const step = sub.length
		let n = 0, pos = 0

		do {
				pos = full.indexOf(sub, pos)
				if (pos < 0)
					break
				n++
				pos += step
		} while (true);
		return n;
}

//##############################################################################
//#                                   OTHERS                                   #
//##############################################################################

export const addEventListener = ({event, handler, element = window}: any) => {
	element.addEventListener(event, handler)
	return () => element.removeEventListener(event, handler)
}

export function listParentNodes(element: Node|null): Array<Node> {
	const result = new Array<Node>()
	while (element) {
		result.unshift(element)
		element = element.parentNode
	}
	return result
}

export function getScrollableParent(element: Node, directions?: Array<"up"|"down"|"left"|"right">): HTMLElement|null {
	const tree = listParentNodes(element) as Array<HTMLElement>
	const up = directions?.includes('up') ?? true
	const down = directions?.includes('down') ?? true
	const left = directions?.includes('left') ?? true
	const right = directions?.includes('right') ?? true
	const y = up || down
	const x = left || right
	for (let i=tree.length-1; i>= 0; i--) {
		const {
			clientWidth: clientW, clientHeight: clientH, clientLeft: clientL, clientTop: clientT,
			scrollWidth: scrollW, scrollHeight: scrollH, scrollLeft: scrollL, scrollTop: scrollT
		} = tree[i]
		if (x && clientW != 0 && clientW < scrollW) {
			if (left && clientL > scrollL)
				return tree[i]
			if (right && clientL + clientW < scrollW - scrollL)
				return tree[i]
		}
		if (y && clientH != 0 && clientH < scrollH) {
			if (up && clientT > scrollT)
				return tree[i]
			if (down && clientT + clientH < scrollH - scrollT)
				return tree[i]
		}
	}
	return null
}

export function negative(n: number) {
	return !Object.is(Math.abs(n), n)
}

export async function fetchJson(input: URL | RequestInfo, init?: RequestInit) {
	const response = await fetch(input, init)
	if (!response.ok) {
		return Promise.reject(
			`Error ${response.status} fetching resource "${input}". Message:\n${response.statusText}`)
	} else {
		return await response.json() as Promise<JSONObject>
	}
}

/**
 * Let the user download the text in a text file
 * @param text content of the file to download
 * @param fileName default name of the file
 */
export function textFileUserDownload(text: string, fileName: string, contentType="text/plain") {
	let element = document.createElement('a');
	element.setAttribute('href', `data:${contentType};charset=utf-8,${encodeURIComponent(text)}`);
	element.setAttribute('download', fileName);
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}

/**
 * requests one or multiple files from the user
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file
 * for more details on the {@link multiple} and {@link accept} parameters
 */
export function requestFilesFromUser({ multiple = false, accept = '' }): Promise<File|File[]|null> {
	return new Promise(((resolve) => {
		const input = document.createElement('input');
		input.setAttribute("type", "file");

		if (accept?.length > 0)
			input.setAttribute("accept", accept);

		if (multiple)
			input.toggleAttribute("multiple", true);

		input.addEventListener("change", ()=> {
			resolve(input.files as File|File[]|null);
		})
		input.click();
	}));
}

export async function requestJSONs({ multiple = false, accept = ''}) : Promise<JSONObject[]|null> {
	let files = await requestFilesFromUser({multiple, accept})
	if (!files)
		return null; // canceled by user
	if (files instanceof File)
		files = [files]
	const jsons = await Promise.all(Array.from(files).map(file=> {
		return new Promise<string>((resolve,reject) => {
			const reader = new FileReader()
			reader.readAsText(file)
			reader.onload = (evt) => {
				if (evt.target?.result?.constructor == String)
					resolve(evt.target.result)
				else
					reject(`cannot read save file ${file.name}`)
			}
		}).then(
			(text)=>JSON.parse(text) as JSONObject,
			(errorMsg)=> {
				throw Error(errorMsg)
		})
	}));
	return jsons
}

export function supportFullscreen() {
	return Boolean(document.fullscreenEnabled)
}

export function isFullscreen() {
	return document.fullscreenElement !== null
}

export function toggleFullscreen() {
	if (isFullscreen())
		document.exitFullscreen()
	else
		document.documentElement.requestFullscreen()
}

export function resettable<T extends Record<PropertyKey, any>>(resetValue: Readonly<T>): [T, VoidFunction, Readonly<T>] {
	const value = deepAssign({}, resetValue) as T
	return [value, deepAssign.bind(null, value, resetValue, {}), resetValue]
}

export function TSForceType<T>(_v: any): asserts _v is T {}

/**
 * Inserts the specified directory in strings that start with
 * a relative path mark ('./' or '../').
 * @param object object to modify
 * @param dir directory path to insert
 */
export function insertDirectory<T extends JSONParent>(object: T, dir: string): T {
	const entries = (object.constructor == Array) ?
			object.entries() : Object.entries(object)
	for (const [key, value] of entries) {
		if (!value)
			continue
		switch(value.constructor) {
			case String :
				TSForceType<String>(value)
				if (value.startsWith('./'))
					(object as any)[key] = dir + value.substring(1)
				else if (value.startsWith('../'))
					(object as any)[key] = dir + '/' + value
				break
			case Object :
				insertDirectory(value as JSONObject, dir)
				break
			case Array :
				insertDirectory(value as (JSONObject|JSONPrimitive)[], dir)
				break
		}
	}
	return object
}

export function versionsCompare(v1: string, v2: string) {
	const v1Split = v1.split('.')
	const v2Split = v2.split('.')
	const len = Math.min(v1Split.length, v2Split.length)
	for (let i=0; i < len; i++) {
		if (v1Split[i] != v2Split[i]) {
			const diff = Math.sign(Number.parseInt(v1Split[i]) - Number.parseInt(v2Split[i]))
			if (diff != 0)
				return diff
			return v1Split[i] > v2Split[i] ? 1 : -1
		}
	}
	return Math.sign(v1Split.length - v2Split.length)
}
