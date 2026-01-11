import { ScriptPlayerBase } from "./ScriptPlayer";

//#endregion ###################################################################
//#region                            TYPES
//##############################################################################

//________________________________private types_________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

type SPB = ScriptPlayerBase<any, any, any, any>

//________________________________public types__________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

export type Instruction = {
	cmd?: string,
	arg?: string,
    handler?: CommandProcessFunction<any>
}

export type CommandProcessFunction<SP extends SPB> = (
	arg: string,
	cmd: string,
	script: SP,
	onFinish: VoidFunction,
) => CommandHandler | Instruction[] | void

export type FFwStopPredicate<SP extends SPB> = (
	line: string,
	index: number,
	page: number,
	lines: string[],
	label: Exclude<SP['currentLabel'], null>,
	script: SP,
) => boolean

export type CommandHandler = {
	next: VoidFunction,
	autoPlayDelay?: number,
}

export type CommandRecord<SP extends SPB> =
	Record<string, CommandProcessFunction<SP>|null>
export type CommandMap<SP extends SPB> = Map<string, CommandRecord<SP>[string]>

export type NumVarName = `%${string}`
export type StrVarName = `$${string}`
export type VarName = NumVarName | StrVarName
export type VarType<T extends NumVarName|StrVarName> =
	T extends NumVarName ? number :
	T extends StrVarName ? string :
	never

//#endregion ###################################################################
//#region                        COMMANDS TOOLS
//##############################################################################

// (%var|n) [(op) (%var|n)]?
const opRegexp = /\s*(?<lhs>(%\w+|\d+))\s*((?<op>[=!><]+)\s*(?<rhs>(%\w+|\d+)))?\s*/
const sepRegexp = /(?<=&&|\|\|)|(?=&&|\|\|)/
export function checkIfCondition(condition: string, script: SPB) {
	let value = true
	for (let [i, token] of condition.split(sepRegexp).entries()) {
		token = token.trim();
		if (i % 2 == 0) {
			const match = opRegexp.exec(token)
			if (!match) throw Error(
				`Unable to parse expression "${token}" in condition ${condition}`)

			let {lhs: _lhs, op, rhs: _rhs} = match.groups as any
			const lhs =
				_lhs.startsWith("%")? script.readVariable(_lhs) : parseInt(_lhs)
			const rhs = _rhs ?
				_rhs.startsWith("%")? script.readVariable(_rhs) : parseInt(_rhs)
				: undefined

			switch (op) {
				case '==' : value = (lhs == rhs); break
				case '!=' : value = (lhs != rhs); break
				case '<'  : value = (lhs <  rhs!); break
				case '>'  : value = (lhs >  rhs!); break
				case '<=' : value = (lhs <= rhs!); break
				case '>=' : value = (lhs >= rhs!); break
				case undefined : value = !!lhs; break // only one expression
				default : throw Error (
					`unknown operator ${op} in condition ${condition}`)
			}
		} else {
			switch (token) {
				case "&&" : if (!value) return false; break
				case "||" : if (value) return true; break
				default : throw Error(
					`Unable to parse operator "${token}" in condition ${condition}`)
			}
		}
	}
	return value
}

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
