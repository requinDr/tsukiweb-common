import { ScriptPlayerBase } from "./ScriptPlayer";

export type SPB = ScriptPlayerBase<any, any, any, any>

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