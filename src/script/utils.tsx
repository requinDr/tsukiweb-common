import { Instruction, SPB, NumVarName } from "./types";

//#endregion ###################################################################
//#region                        COMMANDS TOOLS
//##############################################################################

function getTokenValue(token: string, script: SPB): number {
	if (token.startsWith("%"))
		return script.readVariable(token as NumVarName)
	else
		return parseInt(token)
}

const opRegexp = /\s*([=!<>&|]{1,2}|[()])\s*/g

export function tokenizeCondition(condition: string): string[] {
	
	const tokens: string[] = []
	let m: RegExpMatchArray | null
	let lastIndex = 0
	while ((m = opRegexp.exec(condition)) != null) {
		if (m.index! > lastIndex)
			tokens.push(condition.substring(lastIndex, m.index).trim())
		tokens.push(m[0].trim())
		lastIndex = opRegexp.lastIndex
	}
	if (lastIndex < condition.length)
		tokens.push(condition.substring(lastIndex))
	return tokens
}

function evaluateTokens(tokens: string[], script: SPB): number {
	let lhs: number
	if (tokens.length == 0)
		return 0
	let token = tokens.shift()!
	if (token.match(opRegexp)) {
		if (token == '!')
			lhs = getTokenValue(tokens.shift()!, script) ? 0 : 1
		else if (token == '(')
			lhs = evaluateTokens(tokens, script)
		else
			throw Error(`invalid expression ${tokens.join(' ')}`)
	} else {
		lhs = getTokenValue(token, script)
	}
	while (tokens.length > 0) {
		const token = tokens.shift()!
		if (token.match(opRegexp)) {
			if      (token == '(') lhs = evaluateTokens(tokens, script);
			else if (token == ')') return lhs!
			else if (token == '&&') { if (lhs == 0) return 0 }
			else if (token == '||') { if (lhs != 0) return 1 }
			else { 
				const rhs = getTokenValue(tokens.shift()!, script)
				switch (token) {
					case '>' : lhs = (lhs > rhs) ? 1 : 0; break
					case '>=' : lhs = (lhs >= rhs) ? 1 : 0; break
					case '<' : lhs = (lhs < rhs) ? 1 : 0; break
					case '<=' : lhs = (lhs <= rhs) ? 1 : 0; break
					case '==' : lhs = (lhs == rhs) ? 1 : 0; break
					case '!=' : lhs = (lhs != rhs) ? 1 : 0; break
					default : throw Error(`Unknown operator ${token}`)
				}
			}
		} else {
			if (lhs != null)
				throw Error(`Unexpected identifier`)
			lhs = getTokenValue(token, script)
		}
	}
	return lhs
}

export function evaluateCondition(condition: string, script: SPB) {
	const tokens = tokenizeCondition(condition)
	return (evaluateTokens(tokens, script) != 0)
}

export const checkIfCondition = evaluateCondition

/**
 * Split inline commands (e.g., `!w1000`) into command and argument
 * (e.g., `{cmd: "!w", arg: "1000"}`)
 * @param text - command string
 * @returns command details
 */
function parseInlineCommand(text: string): Instruction {
	const argIndex = text.search(/\d|\s|$/)
	return {
		cmd: text.substring(0, argIndex),
		arg: text.substring(argIndex)
	}
}

/**
 * Extract the inline commands (e.g., `!w1000`) and `@` from a text line
 * and create an array of instructions
 * @param text - original text line
 * @returns extracted instructions
 */
function splitText(text: string) {
	const instructions = new Array<Instruction>()
	let index = 0
	// replace spaces with en-spaces at the beginning of the line
	while (text.charCodeAt(index) == 0x20)
		index++
	text = "\u2002".repeat(index) + text.substring(index)
	// split tokens at every '@', '\', '!xxx'
	while (text.length > 0) {
		index = text.search(/@|!\w|$/)
		if (index > 0)
			instructions.push({cmd:'`', arg: text.substring(0, index)})
		text = text.substring(index)
		switch (text.charAt(0)) {
			case '@' :
				instructions.push({cmd: '@', arg:""})
				text = text.substring(1)
				break
			case '!' : // !w<time>
				const endIndex = text.substring(2).search(/\D|$/)+2
				const cmd = parseInlineCommand(text.substring(0, endIndex))
				instructions.push(cmd)
				text = text.substring(endIndex)
				break
		}
	}
	return instructions
}

/**
 * Extract all instructions from the script line
 * @param line - script line
 * @returns the array of instructions extracted from the line
 */
export function extractInstructions(line: string) {
	const instructions = new Array<Instruction>()
	switch(line.charAt(0)) {
		case '!' : // inline command
			instructions.push(parseInlineCommand(line))
			break
		case '\\' : // page break
			instructions.push({cmd:'\\',arg:''})
			break
		case '`' : // text
			instructions.push(...splitText(line.substring(1)+'\n'))
			break
		default : // normal command
			let index = line.search(/\s|$/)
			instructions.push({
				cmd: line.substring(0,index),
				arg: line.substring(index+1)
			})
			break
	}
	return instructions
}

export function isLinePageBreak(line: string, index: number,
		sceneLines: string[], playing: boolean = false): boolean {
	if (playing) {
		return line.startsWith('\\') || line.startsWith('phase ')
	} else {
		if (line.startsWith('\\'))
			return true
		else if (line.startsWith('phase'))
			// prevents counting 2 pages for conditional phases
			return !sceneLines[index+1].startsWith('skip')
		else
			return false
	}
}

export function getPageAtLine(lines: string[], index: number) {
	let p = 0
	for (let i = 0; i < index; i++) {
		const line = lines[i]
		if (isLinePageBreak(line, i, lines))
			p++
	}
	return p
}