import {
    checkIfCondition, CommandMap, CommandProcessFunction, CommandRecord,
    extractInstructions, FFwStopPredicate, NumVarName, StrVarName, VarName,
    VarType
} from "./utils";
import { BlockPlayer } from "./BlockPlayer";
import Timer from "../utils/timer";
import { simulateObserverChange } from "../utils/Observer";
import { Graphics, JSONObject, PartialJSON, WithRequired } from "../types";
import { deepAssign } from "../utils/utils";
import { AsyncEventsDispatcher } from "../utils/eventsDispatcher"
import HistoryBase from "./history";

type Hist<S extends SP = SP> = HistoryBase<S, any, any, any, any>
type SP = ScriptPlayerBase<any, any, any, Hist>

type PageCallback<LN> = (line: string, lineIndex: number, blockLines: string[], label: LN)=>void

export type ScriptPlayerCallbacks<LN extends string> = {
    beforeBlock: (label: LN, initPage: number) => Promise<void>|void,
    afterBlock: (label: LN) => Promise<void>|void,
    blockStart: (label: LN, initPage: number) => Promise<void>|void,
    blockEnd: (label: LN) => Promise<void>|void,
    pageStart: PageCallback<LN>
    pageEnd: PageCallback<LN>
    finish: (complete: boolean) => void
    autoPlayStart: VoidFunction
    autoPlayStop: VoidFunction
    ffwStart: VoidFunction
    ffwStop: VoidFunction
}

type Callbacks<LN extends string> = ScriptPlayerCallbacks<LN>

type Audio = {
    track: string | null
    looped_se : string | null
}

type InitContext<LN extends string> = PartialJSON<{
    label: LN
    page: number
    audio: Audio
    graphics: Graphics
    flags: string[]
    textPrefix: string
    continueScript: boolean
}>

type PageContext<LN extends string, Content extends JSONObject> = {
    page: number
    label: LN
    graphics: Graphics
    audio: Audio
    textPrefix: string
    text: string
} & Content

type BlockContext<LN extends string, Content extends JSONObject> = {
    label: LN
    flags: string[]
    continueScript: boolean
} & Content

//##############################################################################
//#region                         BASE COMMANDS
//##############################################################################

//________________________________commands list_________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

const base_commands: CommandRecord<any> = {

    'if'     : processIfCmd,
    'gosub'  : processGoto,
    'goto'   : processGoto,

    // 'resettimer' + 'waittimer' preprocessed to 'wait'
    'wait'   : processWait,
    'delay'  : processWait, // same as 'wait', used for credits
    '!w'     : processWait, // used for inline waits

    'skip'   : (n, _, script)=> { script.skip(parseInt(n)) },
    'mov'    : processVarCmd,
    'add'    : processVarCmd,
    'sub'    : processVarCmd,
    'inc'    : processImmVarCmd,
    'dec'    : processImmVarCmd,
}

//_______________________________basic commands_________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function processIfCmd(arg: string, _: string, script: SP) {
    let condition, instrStr
    if (arg.startsWith('(')) {
        let end = arg.indexOf(')', 1)
        if (end < 0)
            throw Error(`Ill-formed 'if' condition: ${arg}`)
        condition = arg.substring(1, end)
        instrStr = arg.substring(end + 1).trim()
    } else {
        let end = arg.search(/ [a-z]/)
        if (end == -1)
            throw Error(`no separation between condition and command: "if ${arg}"`)
        condition = arg.substring(0, end)
        instrStr = arg.substring(end+1)
    }
    if (checkIfCondition(condition, script))
        return extractInstructions(instrStr)
}

function processGoto(arg: string, _: string, script: SP) {
    script.setNextLabel(arg.substring(1))
    script.skipCurrentBlock()
}

function processWait(arg: string, _: string, script: SP,
                     onFinish: VoidFunction) {
    const timeToWait = arg.startsWith('%') ?
            script.readVariable(arg as NumVarName)
            : parseInt(arg)
    const timer = new Timer(timeToWait, onFinish)
    timer.start()
    return { next: timer.skip.bind(timer) }
}

//______________________________variable commands_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function parseValue(str: string, script: SP) {
    switch (str.charAt(0)) {
        case '%' : return script.readVariable(str as NumVarName)
        case '$' : return script.readVariable(str as StrVarName)
        case '"' : return str.substring(1, str.length-1)
        default : return parseInt(str)
    }
}

function processImmVarCmd(arg: string, cmd: string, script: SP) {
    if (!arg.startsWith('%'))
        throw Error(`Unsupported command ${cmd} on argument ${arg}`)
    const val = script.readVariable(arg as NumVarName)
    switch (cmd) {
        case 'inc' : script.writeVariable(arg as NumVarName, val+1); break
        case 'dec' : script.writeVariable(arg as NumVarName, val-1); break
        default : 
            throw Error(`Unexpected command ${cmd}`)
    }
}

function processVarCmd(arg: string, cmd: string, script: SP) {
  let [name, v] = arg.split(',') as [VarName, string]
  let value = parseValue(v, script)

  switch (cmd) {
    case 'mov' : script.writeVariable(name, value); break
    case 'add' :
        script.writeVariable(name, (script.readVariable(name) as any) + value)
        break
    case 'sub' :
        if (name.startsWith('$'))
            throw Error(`Cannot subtract string variable ${arg}`)
        script.writeVariable(name, (script.readVariable(name) as any) + value)
        break
    default : 
        throw Error(`Unexpected command ${cmd}`)
  }
}

//#endregion
//##############################################################################

export abstract class ScriptPlayerBase<
        LN extends string,
        PageContent extends JSONObject,
        BlockContent extends JSONObject,
        H extends Hist<ScriptPlayerBase<LN, PageContent, BlockContent, any>>>
    extends AsyncEventsDispatcher<Callbacks<LN>> {

//##############################################################################
//#region                         ATTRS, PROPS
//##############################################################################
    
//_____________________________private attributes_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    private _uid: number

//----------script execution------------
    private _history: H
    private _blockPlayer: BlockPlayer<this> | null = null;
    private _started: boolean = false;
    private _stopped: boolean = false;
    private _nextLabel: LN|null
    private _initLabel: LN|null
    private _initPage: number
    private _commands: CommandMap<any>
    private _blockSkipped: boolean = false
    private _continueScript: boolean

    // not private because accessible by BlockPlayer. Do not use outside these classes
    _ffwStopCondition: FFwStopPredicate<any>|undefined = undefined
    _ffwDelay: number = 0
    _autoPlay: boolean = false

//----------script variables------------
    private _flags: Set<string>
    private _textPrefix : string // add bbcode before text lines (for e.g., color or alignement)
    private _text: string = ""
    private _audio: Audio
    private _graphics: WithRequired<Graphics, 'monochrome'>

//______________________________public properties_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    
    get uid() { return this._uid }

//----------script execution------------
    get history() { return this._history }

    get currentBlock() { return this._blockPlayer }
    get currentLabel(): LN { return (this._blockPlayer?.label ?? this._nextLabel) as LN }
    get currentPage() { return this._blockPlayer?.page ?? -1 }
    
    get paused() { return this._blockPlayer?.paused ?? false}
    get continueScript() { return this._continueScript }
    
    get fastForwarding() { return this._ffwStopCondition != undefined }
    get ffwStopCondition() { return this._ffwStopCondition }
    private set ffwStopCondition(value: FFwStopPredicate<any>|undefined) {
        this._ffwStopCondition = value
    }
    get ffwDelay() { return this._ffwDelay }
    private set ffwDelay(value: number) {
        this._ffwDelay = value
    }

    get autoPlay() { return this._autoPlay || this.fastForwarding }
    set autoPlay(value: boolean) {
        this.ffw(null)
        if (this._autoPlay != value) {
            this._autoPlay = value
            if (value) {
                this.dispatchEvent('autoPlayStart')
                this._blockPlayer?.onAutoPlayChange()
            } else {
                this.dispatchEvent('autoPlayStop')
            }
        }
    }

//----------script variables------------
    get flags() { return this._flags }

    get audio(): Audio { return this._audio }
    set audio(value: Partial<Audio>) {
        deepAssign(this._audio, value, {extend: false})
    }
    get graphics(): Graphics { return this._graphics }
    set graphics(value: Partial<Graphics>) {
        deepAssign(this._graphics, value, {extend: false})
    }

    get textPrefix() { return this._textPrefix }
    set textPrefix(value: string) { this._textPrefix = value }
    
    get text() { return this._text }
    set text(value: string) {
        this._text = value
        this._history.onTextChange(this)
    }

//#endregion ###################################################################
//#region                          CONSTRUCTOR
//##############################################################################

    constructor(history: H, init: InitContext<LN>) {
        super()
        this._uid = Date.now()
        
        this._history = history
        history.script = this

        this.addEventListener('pageStart', ()=>{
            history.onPageStart(this.pageContext())
        })
        this.addEventListener('beforeBlock', (label)=> {
            history.onBlockStart({...this.blockContext(), label})
        })

        const { graphics, audio, label, flags } = init
        
        this._commands = new Map()
        this._flags = new Set(flags)

        this._nextLabel = label as LN|undefined ?? null
        this._initLabel = label as LN|undefined ?? null
        ;({
            page           : this._initPage       = 0,
            continueScript : this._continueScript = true,
            textPrefix     : this._textPrefix     = ""
        } = init)

        this._graphics = {
            bg: '', l: '', c: '', r: '', monochrome: '', bgAlign: undefined,
            ...(graphics ?? { })
        }
        this._audio = {
            track: '', looped_se: '',
            ...(audio ?? { })
        }
        deepAssign(this._audio, init.audio ?? {})

        this.setCommands(base_commands)
    }

//#endregion ###################################################################
//#region                        PUBLIC METHODS
//##############################################################################

//______________________________script execution________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    skip(nb_lines: number) {
        this._blockPlayer?.skip(nb_lines)
    }

    setNextLabel(label: LN) {
        this._nextLabel = label
    }

    next() {
        this._blockPlayer?.next()
    }
    pause() {
        this._blockPlayer?.pause()
    }
    resume() {
        this._blockPlayer?.resume()
    }

    start() {
        if (!this._started && this._initPage >= 0) {
            this._started = true
            this._runLoop()
        }
    }

    stop() {
        if (!this._stopped) {
            this._stopped = true
            this._blockPlayer?.stop()
        }
    }

    skipCurrentBlock() {
        if (this._blockPlayer) {
            this._blockPlayer.stop()
            this._blockPlayer.next()
        } else {
            this._blockSkipped = true // called in beforeBlock
        }
    }
    ffw(predicate: null): void
    ffw(predicate: FFwStopPredicate<any>, delay?: number): void
    ffw(predicate: FFwStopPredicate<any> | null, delay: number = 0) {
        if (this._ffwStopCondition) {
            this.ffwStopCondition = predicate ?? undefined
            this.ffwDelay = delay
            if (!predicate) {
                this.dispatchEvent('ffwStop')
                simulateObserverChange(this, 'autoPlay')
                simulateObserverChange(this, 'fastForwarding')
            }
        } else if (predicate) {
            if (this._autoPlay) {
                this._autoPlay = false
                this.dispatchEvent('autoPlayStop')
            }
            this.ffwStopCondition = predicate
            this.ffwDelay = delay
            this.dispatchEvent('ffwStart')
        }
        if (predicate)
            this.next()
    }

//___________________________________context____________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    
    pageContext(): PageContext<LN, PageContent> {
        if (!this.currentBlock)
            throw Error(`no active block`)
        return {
            page: this.currentBlock.page,
            label: this.currentLabel as LN,
            graphics: {...this.graphics},
            audio: this.audio,
            textPrefix: this.textPrefix,
            text: this.text,
            ...this.pageContent()
        }
    }
        
    blockContext(): BlockContext<LN, BlockContent> {
        const label = this.currentLabel
        if (!label)
            throw Error('no label')
        return {
            label: label,
            flags: [...this.flags],
            continueScript: this._continueScript,
            ...this.blockContent()
        }
    }

    static defaultPageContext() {
        return {
            page: 0,
            graphics: {bg: "", l:"", c:"", r:"", monochrome: ""} as Graphics,
            audio: {track: null, looped_se: null} as Audio,
            textPrefix: "",
            text: ""
        }
    }

    static defaultBlockContext() {
        return {
            flags: [] as string[],
            continueScript: true
        }
    }

//_______________________________manage commands________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    setCommand(name: string, handler: CommandProcessFunction<this>|null) {
        this._commands.set(name, handler)
    }
    setCommands(commands: CommandRecord<this>) {
        for (const [name, handler] of Object.entries(commands))
            this.setCommand(name, handler)
    }
    getCommand(cmd: string) {
        return this._commands.get(cmd)
    }

//______________________abstract and internal use methods_______________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    abstract readVariable<T extends VarName>(name: T): VarType<T>
    abstract writeVariable<T extends VarName>(name: T, value: VarType<T>): void
    
    abstract fetchLines(label: LN): Promise<string[]>

    isLinePageBreak(line: string, _index: number, _blockLines: string[],
                    _label: LN, _playing: boolean): boolean {
        return line.startsWith('\\')
    }

    async dispatchEvent<E extends keyof Callbacks<LN>>(event: E,
            ...args: Parameters<Callbacks<LN>[E]>) {
        await super.dispatchEvent(event, ...args)
        switch(event) {
            case 'autoPlayStart' : case 'autoPlayStop' :
                simulateObserverChange(this, 'autoPlay')
                break
            case 'pageStart' :
                this.text = ""
                break
        }
    }

//#endregion ###################################################################
//#region                        PRIVATE METHODS
//##############################################################################

    protected abstract blockContent(): BlockContent
    protected abstract pageContent(): PageContent
    
    protected abstract nextLabel(label: LN): LN|null

    private async _runLoop() {
        while (this._nextLabel != null) {
            const label = this._nextLabel
            let page
            if (label == this._initLabel) {
                page = this._initPage
                // prevent going back to initPage if the block ever comes back
                this._initPage = 0
            } else {
                page = 0
            }
            this._blockPlayer = null
            this._blockSkipped = false
            await this.dispatchEvent('beforeBlock', label, page)
            if (this._stopped)
                break
            if (!this._blockSkipped && label == this._nextLabel) {
                await new Promise<void|boolean>(resolve => {
                    this._blockPlayer = new BlockPlayer(this, label, page,
                        () => {
                            if (this._stopped) resolve()
                            else this._blockPlayer?.start()
                        },
                        resolve
                    )
                })
                if (this._stopped)
                    break
            }
            await this.dispatchEvent('afterBlock', label)
            if (this._stopped)
                break

            // if no 'goto/gosub', search for the next label
            else if (this._nextLabel == label)
                this._nextLabel = this.nextLabel(label)
        }
        this._blockPlayer = null
        await this.dispatchEvent('finish', this._nextLabel == null)
        this._started = false
    }

//#endregion
//##############################################################################

}
