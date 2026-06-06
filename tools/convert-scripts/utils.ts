
type SwitchMap<T> = ([
    string, T|((s: string)=>T)
] | [
    RegExp, T|((m: RegExpMatchArray)=>T)
])[]
function switch_regex<T>(str: string, map: SwitchMap<T>, fallback: T|((s: string)=>T)) {
    for (const [key, result] of map) {
        if (key instanceof RegExp) {
            const m = str.match(key)
            if (m) {
                if (typeof result == 'function')
                    return (result as (m: RegExpMatchArray)=>T)(m)
                else
                    return result
            }     
        } else if (key == str) {
            if (typeof result == 'function')
                return (result as (s: string)=>T)(str)
            else
                return result
        }
    }
    if (typeof fallback == 'function')
        return (fallback as (s: string)=>T)(str)
    else
        return fallback
}

const CONDITION_REGEXP = /^(?<lhs>(%\w+|\d+))(?<op>[=!><]+)(?<rhs>(%\w+|\d+))$/

function processCondition(condition: string, processVarName: (varName: string)=>string|null): string|null {
	condition = condition.trim()
    for (const sep of ['&&', '||']) {
        let subConditions = condition.split(sep)
        if (subConditions.length > 1)
            return subConditions.map(c=>processCondition(c, processVarName))
                                .filter(c => c).join(` ${sep} `)
    }
	let match = CONDITION_REGEXP.exec(condition)
	if (!match) throw Error(`Unable to parse condition "${condition}"`)

	let {lhs, op, rhs} = match.groups as Record<'lhs'|'op'|'rhs', string|null>
	if (lhs?.startsWith('%')) lhs = processVarName(lhs)
	if (rhs?.startsWith('%')) rhs = processVarName(rhs)
	if (!lhs || !rhs) return null
	return `${lhs}${op}${rhs}`
}

export {
    switch_regex,
    processCondition
}