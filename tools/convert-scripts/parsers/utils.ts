import assert from "assert";
import { parseScript } from "./nscriptr.ts";

//##############################################################################
//#region                            TOKENS
//##############################################################################


export class Token {
	lineIndex: number
	constructor(lineIndex: number) {
		this.lineIndex = lineIndex
	}

	toString(): string {
		throw Error(`Unimplemented method 'toString'`)
	}
}

export class TextToken extends Token {
	text: string
	constructor(lineIndex: number, text: string) {
		super(lineIndex)
		/** @type {string} */
		this.text = text
	}

	toString() {
		return `\`${this.text}`
	}
}

export class CommandToken<C extends string = string> extends Token {
	cmd: C
	args: string[]
	constructor(lineIndex: number, cmd: C, args: string[] = []) {
		super(lineIndex)
		this.cmd = cmd
		this.args = args
	}

	toString() {
		if (this.cmd.startsWith('!'))
			return `${this.cmd}${this.args[0]}`
		else if (this.args.length == 0)
			return this.cmd
		else
			return `${this.cmd} ${[...this.args].join(',')}`
	}
}

export class KagCommandToken<C extends string = string> extends Token {
	cmd: C
	args: Map<string, string>
	constructor(lineIndex: number, cmd: C, args: Map<string, string> = new Map()) {
		super(lineIndex)
		this.cmd = cmd
		this.args = args
	}

	toString() {
		if (this.args.size == 0)
			return this.cmd
		else
			return `${this.cmd} {${[...this.args.entries()].map(([k, v])=>
				`${k}=${v}`).join(',')
			}}`
	}
}

export class LabelToken extends Token {
	label: string
	constructor(lineIndex: number, label: string) {
		super(lineIndex)
		this.label = label
	}

	toString() {
		return `*${this.label}`
	}
}

export class ReturnToken extends Token {

	toString() {
		return 'return'
	}
}

export class ConditionToken extends Token {
	not: boolean
	condition: string
	command: Token
	constructor(lineIndex: number, not: boolean, condition: string, command: Token) {
		super(lineIndex)
		this.not = not
		this.condition = condition // TODO normalize operators and spaces around them
		this.command = command
	}
	toString() {
		return `${this.not? 'not':''}if (${this.condition}) ${this.command.toString()}`
	}
}

export class ErrorToken extends Token {
	txt: string
	constructor(lineIndex: number, txt: string) {
		super(lineIndex)
		this.txt = txt
	}
}

//##############################################################################
//#region                             BLOCK
//##############################################################################

export class Block {
	public name: string
	private _tokens: Token[]
	private _iterIndices: Map<number, number>
	constructor(name: string, tokens: Iterable<Token>) {
		this.name = name
		this._tokens = Array.from(tokens)
		this._iterIndices = new Map()
	}

	get tokens() {
		return this._tokens as Readonly<Token[]>
	}

	private _iterKey() {
		let iterKey: number
		do
			iterKey = Math.floor(Math.random() * this._iterIndices.size*1000)
		while (this._iterIndices.has(iterKey))
		return iterKey
	}
	
	get length() {
		return this._tokens.length
	}
	get firstLineIndex() {
		return this.at(0)?.lineIndex ?? 0
	}

	*[Symbol.iterator](): Generator<[Token, number, this]> {
		const key = this._iterKey()
		let i
		try {
			this._iterIndices.set(key, 0)
			while ((i = this._iterIndices.get(key)!) < this._tokens.length) {
				yield [this._tokens[i], i, this]
				this._iterIndices.set(key, this._iterIndices.get(key)!+1)
			}
		} finally {
			this._iterIndices.delete(key)
		}
	}

	at(index: number) {
		return this._tokens.at(index)
	}
	
	slice(start: number, end?:number) {
		return this._tokens.slice(start, end)
	}
//________________________________find methods__________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	find(predicate: (t: Token, i: number, b: Block)=>boolean) {
		return this._tokens.find((t, i)=>predicate(t, i, this))
	}
	findIndex(predicate: (t: Token, i: number, b: Block)=>boolean) {
		return this._tokens.findIndex((t, i)=>predicate(t, i, this))
	}
	findLast(predicate: (t: Token, i: number, b: Block)=>boolean) {
		return this._tokens.findLast((t, i)=>predicate(t, i, this))
	}
	findLastIndex(predicate: (t: Token, i: number, b: Block)=>boolean) {
		return this._tokens.findLastIndex((t, i)=>predicate(t, i, this))
	}
	indexOf(item: Token|string, fromIndex: number = 0) {
		if (item instanceof Token)
			return this._tokens.indexOf(item, fromIndex)
		else {
			const i = this._tokens.slice(fromIndex).findIndex(t=>t.toString() == item)
			if (i >= 0)
				return i + fromIndex
			else
				return i
		}
	}
	lastIndexOf(item: Token|string, fromIndex: number = 0) {
		if (item instanceof Token)
			return this._tokens.lastIndexOf(item, fromIndex)
		else
			return this._tokens.slice(0, fromIndex).findLastIndex(t=>t.toString() == item)
	}
	
//____________________________modification methods______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	delete(index: number, count: number = 1) {
		if (index < 0)
			index += this._tokens.length
		assert(index >= 0 && index < this._tokens.length, "Attempting to remove a token outside of the block")
		for (const [key, i] of this._iterIndices) {
			if (i >= index) {
				if (i >= (index + count))
					this._iterIndices.set(key, i - count)
				else
					this._iterIndices.set(key, index-1)
			}
		}
		this._tokens.splice(index, count)
	}

	insert(index: number, items: Token|Token[]|string, lineIndex: number = -1) {
		if (items instanceof Token)
			items = [items]
		else if (typeof items == 'string')
			items = parseScript(items)
		for (const [key, i] of this._iterIndices) {
			if (i >= index)
				this._iterIndices.set(key, i + items.length)
		}
		const idx = lineIndex >= 0 ? lineIndex
					: index > 0 ? this._tokens.at(index-1)?.lineIndex ?? 0 : 0
		for (const tok of items) {
			tok.lineIndex = idx
		}
		this._tokens.splice(index, 0, ...items)
		return items.length
	}
	
	replace(index: number, delete_length: number, items: string|Token|Token[]) {
		if (delete_length < 0)
			throw Error(`Cannot delete a negative number of tokens`)
		if (delete_length == 0) {
			this.insert(index, items)
			return
		}
		if (index < 0)
			index += this.length
		if (delete_length == 1) {
			const lineIdx = this.at(index)!.lineIndex ?? 0
			this.delete(index)
			this.insert(index, items, lineIdx)
			return
		} else {
			const firstLineIdx = this.at(index)!.lineIndex
			const lastLineIdx = (index + delete_length > this.length ? this.at(-1) : this.at(index + delete_length - 1))!.lineIndex
			this.delete(index, delete_length)
			const count = this.insert(index, items)
			for (let i=0; i < count; i++) {
				this.at(index + i)!.lineIndex = firstLineIdx
					+ Math.round(((i+1)/count) * (lastLineIdx - firstLineIdx))
			}
		}
	}

	replaceText(search: string|RegExp, replaceString: string, maxCount = -1, fromIndex: number = 0) {
		for (const [i, t] of this.slice(fromIndex).entries()) {
			if (t.toString().search(search) >= 0) {
				let str = t.toString()
				if (maxCount == -1)
					str.replaceAll(search, replaceString)
				else {
					do {
						str = str.replace(search, replaceString)
						maxCount--
					} while (maxCount > 0 && str.search(search) >= 0)
				}
				this.replace(i + fromIndex, 1, str)
				if (maxCount == 0)
					break
			}
		}
	}

	extend(block: Block) {
		this._tokens.push(...block._tokens)
	}
	
//________________________________other methods_________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	
	filter(predicate: (t: Token, i: number, b: this)=>boolean) {
		return this._tokens.filter((t, i)=>predicate(t, i, this))
	}

	forEach(callback: (t: Token, i: number, b: this)=>void) {
		for (const [t, i, b] of this) {
			callback(t, i, b)
		}
	}

	toString() {
		return this._tokens.map(t=>t.toString().trimEnd()).join('\n')
	}
}

//#endregion ###################################################################
//#region                            READER
//##############################################################################

export class StrReader {
	
	private _text: string
	private _index: number
	private _lineIndex: number
	constructor(str: string, start = 0) {
		this._text = str
		this._index = start
		this._lineIndex = 0
	}

	get charIndex() {
		return this._index
	}

	get lineIndex() {
		return this._lineIndex
	}

//__________________________________movements___________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	atEnd() {
		return this._index >= this._text.length
	}

	moveTo(position: number) {
		if (position < 0)
			position = Math.max(0, this._text.length + position)
		else if (position > this._text.length)
			position = this._text.length

		if (position < this._index) {
			const subText = this._text.substring(position, this._index)
			const nbLineBreaks = (subText.match(/\n/g) || []).length
			this._lineIndex -= nbLineBreaks
		} else {
			const subText = this._text.substring(this._index, position)
			const nbLineBreaks = (subText.match(/\n/g) || []).length
			this._lineIndex += nbLineBreaks
		}
		this._index = position
	}

	moveBy(offset: number) {
		// avoid negative indices that would loop to end of text.
		// going further than text length already handled by moveTo()
		this.moveTo(Math.max(0, this._index + offset))
	}

//_____________________________________peek_____________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	peek(length: number) {
		const stop = Math.min(this._index + length, this._text.length)
		return this._text.substring(this._index, stop)
	}

	peekUntil(strOrRegexp: string|RegExp, includeMatch = false) {
		let index
		if (strOrRegexp.constructor == String) {
			index = this._text.indexOf(strOrRegexp, this._index)
			if (includeMatch)
				index += strOrRegexp.length
		} else {
			const text = this._text.substring(this._index)
			if (includeMatch) {
				const match = text.match(strOrRegexp)
				if (match)
					index = match.index! + match[0].length
				else
					index = -1
			} else {
				index = text.search(strOrRegexp)
				if (index < 0)
					index = -1
				else
					index += this._index
			}
		}

		if (index == -1)
			return this._text.substring(this._index)
		return this._text.substring(this._index, index)
	}
	

	peekMatch(strOrRegexp: string|RegExp) {
		if (strOrRegexp.constructor == String) {
			const len = strOrRegexp.length
			if (this._text.substring(this._index, this._index + len) == strOrRegexp)
				return strOrRegexp
			else
				return null
		} else {
			const match = this._text.substring(this._index).match(strOrRegexp)
			if (match)
				return match[0]
			return null
		}
	}

	peekLine(includeEnd = true) {
		let index = this._text.indexOf('\n', this._index)
		if (index == -1)
			return this._text.substring(this._index)
		if (includeEnd) {
			return this._text.substring(this._index, index+1)
		} else {
			if (this._text.charAt(index-1) == '\r')
				index -= 1 // also remove \r
			return this._text.substring(this._index, index)
		}
	}


	peekLineUntil(strOrRegexp: string|RegExp, includeMatch = false, includeEnd = true) {
		const line = this.peekLine(includeEnd)
		const r = new StrReader(line)
		return r.peekUntil(strOrRegexp, includeMatch)
	}

//_____________________________________read_____________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	read(length = this._text.length - this._index) {
		const result = this.peek(length)
		this.moveBy(result.length)
		return result
	}

	readUntil(strOrRegexp: string|RegExp, includeMatch = false) {
		const result = this.peekUntil(strOrRegexp, includeMatch)
		this.moveBy(result.length)
		return result
	}

	readMatch(strOrRegexp: string|RegExp) {
		const result = this.peekMatch(strOrRegexp)
		if (result)
			this.moveBy(result.length)
		return result
	}

	readLine(includeEnd = true) {
		const result = this.peekLine(true) // move index to next line even if not included
		this.moveBy(result.length)

		if (includeEnd || !result.endsWith('\n'))
			return result
		if (result.endsWith('\r\n'))
			return result.substring(0, result.length-2)
		else
			return result.substring(0, result.length-1)
	}

	readLineUntil(strOrRegexp: string|RegExp, includeMatch = false, includeEnd = true) {
		const result = this.peekLineUntil(strOrRegexp, includeMatch, includeEnd)
		this.moveBy(result.length)
		return result
	}
}