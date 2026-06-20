import {StrReader, Token, TextToken, CommandToken, ReturnToken, LabelToken, ConditionToken, ErrorToken} from "./utils.ts"

const CONDITION_REGEXP = /((^|\s*[&<>!=]*)\s*([%$\d-]\w*|fchk|"[^"]"))*/
// [%$]X*|N* <=!> [%$]X*|N* (&& ...)*
const ARGUMENT_REGEXP = /^`[^`]*`|"[^"]*"|[#\w%$*-]+/

//##############################################################################
//#region                         TOKEN PARSERS
//##############################################################################


function parseText(lineIndex: number, str: string) {
    if (str.startsWith('`'))
        str = str.substring(1)
    let texts = str.split('\\')
    if (texts.length == 1) {
        return [new TextToken(lineIndex, str)]
    }
    // if '\' must be kept at end of text line instead of on separate line,
    // simply split *after* each '\'
    let tokens = []
    if (texts[0].length > 0)
        tokens.push(new TextToken(lineIndex, texts[0]))
    for (let i=1; i < texts.length; i++) {
        tokens.push(new CommandToken(lineIndex, '\\'))
        if (texts[i].length > 0)
            tokens.push(new TextToken(lineIndex, texts[i]))
    }
    return tokens
}

function parseReturn(lineIndex: number, str: string) {
    return [new ReturnToken(lineIndex)]
}

function parseCondition(lineIndex: number, str: string): Token[] {
    const cmdReader = new StrReader(str)
    let cmd = cmdReader.readMatch(/^\w+\b/)
    let not
    switch(cmd) {
        case 'if' : not = false; break;
        case 'notif' : not = true; break;
        default : throw Error(`Unexpected command '${cmd}' for condition token`)
    }
    cmdReader.readMatch(/\s*/) //trim whitespaces
    const condition = cmdReader.readMatch(CONDITION_REGEXP)!
    // extract commands until end of line (separated by ':')
    const commands = parseScript(cmdReader.read().trim())
    commands.forEach(tkn=> tkn.lineIndex += lineIndex) //TODO maybe single line index?

    if (commands.length == 1)
        return [new ConditionToken(lineIndex, not, condition, commands[0])]
    
    not = !not
    const skip = parseScript("skip 1") //TODO check if 1 or 2
    if (skip.length != 1)
        throw Error("Error parsing inserted 'skip 1'")
    skip[0].lineIndex += lineIndex
    return [
        new ConditionToken(lineIndex, not, condition, skip[0]),
        ...commands
    ]
}

function parseLabel(lineIndex: number, str: string) {
    if (str.startsWith('*'))
        str = str.substring(1)
    return [new LabelToken(lineIndex, str)]
}

function parseCommand(lineIndex: number, str: string) {
    let cmd, arg, args, reader
    str = str.trimStart()
    switch (str.charAt(0)) {
        case '@' : case '\\' : case '~' :
            if (str.length > 1)
                throw Error(`Unexpected command ${str}`)
            return [new CommandToken(lineIndex, str)]
        case '+' : return [] // unknown command. Ignore.
        case '!' :
            reader = new StrReader(str)
            cmd = reader.readMatch(/^![a-z]+/)!
            arg = reader.read()
            args = arg ? [arg] : []
            return [new CommandToken(lineIndex, cmd, args)]
        case '#' :
            return [new CommandToken(lineIndex, 'textcolor', [str])]
        default :
            reader = new StrReader(str)
            cmd = reader.readMatch(/^\w+\b/)!
            reader.readMatch(/\s*/)
            args = []
            while (!reader.atEnd()) {
                arg = reader.readMatch(ARGUMENT_REGEXP)
                reader.readMatch(/\s*,\s*/)
                if (!arg)
                    break
                args.push(arg)
            }
            return [new CommandToken(lineIndex, cmd, args)]
    }
}

function parseError(lineIndex: number, str: string) {
    // console.log(`Warning line ${lineIndex + 1}: ${str}`)
    return [new ErrorToken(lineIndex, str)]
}

//##############################################################################
//#region                         SCRIPT PARSER
//##############################################################################

type Tokenizer = (i: number, str: string)=>Token[]

const tokensRE = new Map<string, [string|RegExp, Tokenizer|null]>(Object.entries({
    'comment'       : [/^(\s*(;.*)?\r?\n)+/, null],
    'asciiText'     : [/^\s*`[^\n`]*(`|\r?\n|$)/, parseText],
    'nonAsciiText'  : [/^\s*[^ \t\na-z;`*@\\+!:,~"#][^\n\\]*/u, parseText],
    'return'        : [/^\s*return\s*\r?\n/, parseReturn],
    'condition'     : [/^\s*(not)?if\s[^\n]*/, parseCondition],
    'cmd'           : [/^\s*(?<cmd>[a-z]\w+)[ \t]*(?<args>(([\w%$_#*-]*|"([^\n"]|(_"))*"|`[^`]*`)(,\s*)?[ \t]*)+)?/u, parseCommand],
    'cmd2'          : [/^[@\\+]/, parseCommand],
    'cmd3'          : [/^![a-z]+\d*/, parseCommand],
    'cmd4'          : [/^#[\da-fA-F]+/, parseCommand],
    'label'         : [/^\*\w*\b/, parseLabel],
    'separator'     : [':', null],
    'error1'        : [/^"\r?\n/, parseError]
}))


function parseScript(text: string, singleLineIndex = -1) {
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
    if (singleLineIndex != -1) {
        tokens.forEach(t => t.lineIndex = singleLineIndex)
    }
    return tokens
}

export {
    parseScript,
}