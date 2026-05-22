/**
 * @template {T}
 * @param {string} str
 * @param {Map<RegExp, any|((m: RegExpMatchArray)=>any)> &
 *         Map<string, any|((s: string)=>any)>} map
 * @param {any|(s: string)=>any} fallback
 */
function switch_regex(str, map, fallback) {
    for (const [key, result] of map.entries()) {
        if (key instanceof RegExp) {
            const m = str.match(key)
            if (m) {
                if (typeof result == 'function')
                    return result(m)
                else
                    return result
            }     
        } else if (key == str) {
            if (typeof result == 'function')
                return result(str)
            else
                return result
        }
    }
    if (typeof fallback == 'function')
        return fallback(str)
    else
        return fallback
}

const CONDITION_REGEXP = /^(?<lhs>(%\w+|\d+))(?<op>[=!><]+)(?<rhs>(%\w+|\d+))$/
/**
 * 
 * @param {string} condition 
 * @param {(varName: string)=>Nullable<string>} processVarName 
 * @returns 
 */
function processCondition(condition, processVarName) {
	condition = condition.trim()
    for (const sep in ['&&', '||']) {
        let subConditions = condition.split(sep)
        if (subConditions.length > 1)
            return subConditions.map(processCondition)
                                .filter(c => c).join(` ${sep} `)
    }
	let match = CONDITION_REGEXP.exec(condition)
	if (!match) throw Error(`Unable to parse condition "${condition}"`)

	let {lhs, op, rhs} = match.groups
	if (lhs.startsWith('%')) lhs = processVarName(lhs)
	if (rhs.startsWith('%')) rhs = processVarName(rhs)
	if (!lhs || !rhs) return null
	return `${lhs}${op}${rhs}`
}

export {
    switch_regex,
    processCondition
}