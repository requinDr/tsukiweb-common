import {
    checkIfCondition, CommandMap, CommandProcessFunction, CommandRecord,
    extractInstructions, FFwStopPredicate, NumVarName, StrVarName, VarName
} from "./utils";
import { BlockPlayerBase as BlockPlayer } from "./BlockPlayer";
import Timer from "../utils/timer";

type SP = ScriptPlayerBase<any>

export type ScriptPlayerCallbacks<LN extends string> = {
    beforeBlock: (label: LN, initPage: number) => Promise<void>|void,
    afterBlock: (label: LN) => Promise<void>|void,
    onBlockStart: (label: LN, initPage: number) => Promise<void>|void,
    onBlockEnd: (label: LN) => Promise<void>|void,
    onPageStart: (line: string, lineIndex: number, blockLines: string[],
                label: LN)=>void
    onPageEnd: (line: string, lineIndex: number, blockLines: string[],
                  label: LN)=>void
    onFinish: (complete: boolean) => void
    onAutoPlayStart: (ffw: boolean)=>void
    onAutoPlayStop: (ffw: boolean)=>void
}

type Callbacks<LN extends string> = ScriptPlayerCallbacks<LN>

//##############################################################################
//#region                         BASE COMMANDS
//##############################################################################

//________________________________commands list_________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

const base_commands: CommandRecord<SP> = {

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

export abstract class ScriptPlayerBase<LN extends string> {

//##############################################################################
//#region                         ATTRS & PROPS
//##############################################################################
    
//_____________________________private attributes_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    private _blockPlayer: BlockPlayer<LN> | null = null;
    private _started: boolean = false;
    private _stopped: boolean = false;
    private _nextLabel: LN|null
    private _initLabel: LN
    private _initPage: number
    private _commands: CommandMap<any>
    private _blockSkipped: boolean = false

//--------------callbacks---------------
    private _onFinish?: Callbacks<LN>['onFinish']
    private _beforeBlock?: Callbacks<LN>['beforeBlock']
    private _afterBlock?: Callbacks<LN>['afterBlock']
    private _onBlockStart?: Callbacks<LN>['onBlockStart']
    private _onBlockEnd?: Callbacks<LN>['onBlockEnd']
    private _onPageStart?: Callbacks<LN>['onPageEnd']
    private _onPageEnd?: Callbacks<LN>['onPageEnd']
    private _onAutoPlayStart?: Callbacks<LN>['onAutoPlayStart']
    private _onAutoPlayStop?: Callbacks<LN>['onAutoPlayStop']

//______________________________public properties_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    get currentBlock() { return this._blockPlayer }
    get currentLabel() { return this._blockPlayer?.label ?? this._nextLabel }
    get currentPage() { return this._blockPlayer?.page ?? -1 }

    get autoPlay() { return this._blockPlayer?.autoPlay ?? false}
    set autoPlay(value: boolean) {
        if (this._blockPlayer)
            this._blockPlayer.autoPlay = value
    }
    get fastForwarding() { return this._blockPlayer?.fastForwarding ?? false }

    get paused() { return this._blockPlayer?.paused ?? false}

//#endregion ###################################################################
//#region                          CONSTRUCTOR
//##############################################################################

    constructor(initLabel: LN, initPage: number,
            callbacks: Partial<Callbacks<LN>> = {}) {
        this._nextLabel = initLabel
        this._initLabel = initLabel
        this._initPage = initPage
        this._commands = new Map();
        ({
            beforeBlock    : this._beforeBlock,
            afterBlock     : this._afterBlock,
            onBlockStart   : this._onBlockStart,
            onBlockEnd     : this._onBlockEnd,
            onPageStart    : this._onPageStart,
            onPageEnd      : this._onPageEnd,
            onFinish       : this._onFinish,
            onAutoPlayStart: this._onAutoPlayStart,
            onAutoPlayStop : this._onAutoPlayStop,
        } = callbacks)

        this.setCommands(base_commands)
    }

//#endregion ###################################################################
//#region                        PUBLIC METHODS
//##############################################################################

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

    ffw(stop: null):void
    ffw(stop: FFwStopPredicate<this>, delay?: number):void
    ffw(stop: FFwStopPredicate<this> | null, delay: number = 0) {
        if (stop)
            this._blockPlayer?.ffw(stop, delay)
        else
            this._blockPlayer?.ffw(null)
    }

    setCommand(name: string, handler: CommandProcessFunction<this>|null) {
        this._commands.set(name, handler)
    }
    setCommands(commands: CommandRecord<this>) {
        for (const [name, handler] of Object.entries(commands))
            this.setCommand(name, handler)
    }
    getCommand(cmd: string): CommandProcessFunction<this>|null|undefined {
        return this._commands.get(cmd)
    }

    setBeforeBlockCallback(callback: Callbacks<LN>['beforeBlock']|undefined) {
        this._beforeBlock = callback
    }

    setAfterBlockCallback(callback: Callbacks<LN>['afterBlock']|undefined) {
        this._afterBlock = callback
    }

    setBlockStartCallback(callback: Callbacks<LN>['onBlockStart']|undefined) {
        this._onBlockStart = callback
    }
    
    setBlockEndCallback(callback: Callbacks<LN>['onBlockEnd']|undefined) {
        this._onBlockEnd = callback
    }

    setPageStartCallback(callback: Callbacks<LN>['onPageEnd']|undefined) {
        this._onPageStart = callback
    }

    setPageEndCallback(callback: Callbacks<LN>['onPageEnd']|undefined) {
        this._onPageEnd = callback
    }

    setFinishCallback(callback: Callbacks<LN>['onFinish']|undefined) {
        this._onFinish = callback
    }

    setAutoPlayStartCallback(callback: Callbacks<LN>['onAutoPlayStart']|undefined) {
        this._onAutoPlayStart = callback
    }

    setAutoPlayStopCallback(callback: Callbacks<LN>['onAutoPlayStop']|undefined) {
        this._onAutoPlayStop = callback
    }

    abstract readVariable(name: StrVarName): string
    abstract readVariable(name: NumVarName): number
    abstract readVariable(name: VarName): string|number
    abstract writeVariable(name: StrVarName, value: string): void
    abstract writeVariable(name: NumVarName, value: number): void
    abstract writeVariable(name: VarName, value: string|number): void
    
    abstract fetchLines(label: LN): Promise<string[]>

    abstract isLinePageBreak(line: string, index: number, blockLines: string[],
                             label: LN, playing: boolean): boolean
    onBlockStart(label: LN, initPage: number) {
        this._onBlockStart?.(label, initPage)
    }
    onBlockEnd(label: LN) {
        this._onBlockEnd?.(label)
    }
    onPageStart(line: string, index: number, blockLines: string[], label: LN) {
        this._onPageStart?.(line, index, blockLines, label)
    }
    onPageEnd(line: string, index: number, blockLines: string[], label: LN) {
        this._onPageEnd?.(line, index, blockLines, label)
    }
    onAutoPlayStart(ffw: boolean) {
        this._onAutoPlayStart?.(ffw)
    }
    onAutoPlayStop(ffw: boolean) {
        this._onAutoPlayStop?.(ffw)
    }

//#endregion ###################################################################
//#region                        PRIVATE METHODS
//##############################################################################

    protected abstract nextLabel(label: LN): LN|null
    protected async beforeBlock(label: LN, initPage: number) : Promise<void> {
        if (this._beforeBlock)
            return this._beforeBlock(label, initPage)
    }
    protected async afterBlock(label: LN) : Promise<void> {
        if (this._afterBlock)
            return this._afterBlock(label)
    }

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
            await this.beforeBlock(label, page)
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
            await this.afterBlock(label)
            if (this._stopped)
                break

            // if no 'goto/gosub', search for the next label
            else if (this._nextLabel == label)
                this._nextLabel = this.nextLabel(label)
        }
        this._blockPlayer = null
        this._onFinish?.(this._nextLabel == null)
        this._started = false
    }

//#endregion
//##############################################################################

}
