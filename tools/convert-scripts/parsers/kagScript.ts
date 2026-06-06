import {StrReader, TextToken, LabelToken, KagCommandToken, Token} from "./utils.ts"

// [%$]X*|N* <=!> [%$]X*|N* (&& ...)*
const ARGUMENT_REGEXP = /\s*(?<key>[^\s=]+)(\s*=(?<val>[-\d][\w.]*|[^\s\d"][^\s"]*|"[^\n"]*")?)?/


//##############################################################################
//#region                         TOKEN PARSERS
//##############################################################################

function parseText(lineIndex: number, str: string) {
    // ALL text lines that don't end with [r] have a page break right after
    //  --> line breaks inside lines can be ignored
    // inline commands (ruby and graph) can be handled in plus-disc conversion
    let text = str.replaceAll('[lr]', '[l][r]').split('[l]').join('@')
    return [new TextToken(lineIndex, text)]
}

function parseLabel(lineIndex: number, str: string) {
    if (str.startsWith('*'))
        str = str.substring(1)
    return [new LabelToken(lineIndex, str)]
}

function parseCommand(lineIndex: number, str: string) {
    if (str.startsWith('[') && str.endsWith(']'))
        str = str.substring(1, str.length-1)
    else if (str.startsWith('@'))
        str = str.substring(1)
    else
        throw new Error(`Ill-formatted command line ${lineIndex}: '${str}'`)
    const reader = new StrReader(str)
    const cmd = reader.readMatch(/^\w+/)!
    reader.readMatch(/^\s*/)
    let argsString = reader.read()
    let args = new Map()
    let m
    while ((m = ARGUMENT_REGEXP.exec(argsString))) {
        argsString = argsString.substring(m.index + m[0].length)
        args.set(m.groups!['key'], m.groups!['val'] ?? null);
    }
    return [new KagCommandToken(lineIndex, cmd, args)]
}

//##############################################################################
//#region                         SCRIPT PARSER
//##############################################################################

type Tokenizer = (i: number, str: string)=>Token[]

const tokensRE = new Map<string, [string|RegExp, Tokenizer|null]>(Object.entries({
    'comment'       : [/^(\t*(;.*)?\r?\n)+/, null],
    'command'       : [/^\t*@\w+([ \t]+[^\s=]+(\s*=([-\d][\w.]*|[^\s\d"][^\s"]*|"[^\n"]*")?)?)*/, parseCommand],
    'label'         : [/^\t*\*\w*\b(\|.*)/, parseLabel],
    'text'          : [/^\t*[^@;*\t].*/, parseText],
}))

function parseScript(text: string) {
    const reader = new StrReader(text)
    const tokens = []
    
    while (!reader.atEnd()) {
        let found = false
        let lineIndex = reader.lineIndex
        
        for (const [name, [re, func]] of tokensRE.entries()) {
            const tokenText = reader.readMatch(re);
            if (tokenText) {
                found = true
                if (func)
                    tokens.push(...func(lineIndex, tokenText.trimEnd()))
                break;
            }
        }
        if (!found) {
            debugger;
            throw Error(`Cannot determine token for text: '${reader.peek(30)}'`)
        }
    }
    return tokens
}

export {
    parseScript,
}