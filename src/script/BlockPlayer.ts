
import Timer from "../utils/timer"
import { CommandHandler, extractInstructions, FFwStopPredicate } from "./utils";
import { ScriptPlayerBase } from "./ScriptPlayer";

type BlockFinishCallback =
    (complete: boolean)=> void

type SPB<LN extends string> = ScriptPlayerBase<LN, any, any, any>

export class BlockPlayerBase<LabelName extends string> {

//#endregion ###################################################################
//#region                         ATTRS & PROPS
//##############################################################################
    
//_____________________________private attributes_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    private _script: SPB<LabelName>
    private _onFinish: (complete: boolean) => void
//---------------status-----------------
    private _autoPlay: boolean = false
    private _ffwStop: FFwStopPredicate<SPB<LabelName>> | null = null
    private _ffwDelay: number = 0
    private _stopped: boolean = false
    private _started: boolean = false
    private _pauseRequested: boolean = false
    private _resume: VoidFunction|undefined = undefined
//-------------block info---------------
    private _label: LabelName
    private _blockLines: string[]
//-------------progression--------------
    private _page: number
    private _lineIndex: number
    private _currLine: string | null = null
    private _currCmd: CommandHandler | null = null
//-----------private setters------------
    private set page(value: number) {
        this._page = value
    }

//______________________________public properties_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    get label() { return this._label }
    get page() { return this._page }
    get index() { return this._lineIndex }
    get blockLines() { return this._blockLines }
    get currLine() { return this._currLine }

    get loaded() { return this._blockLines.length > 0 }

    get autoPlay() { return this._autoPlay || this.fastForwarding }
    set autoPlay(value: boolean) {
        this.ffw(null)
        if (this._autoPlay != value) {
            this._autoPlay = value
            if (value) {
                this._script.onAutoPlayStart(false)
                this._makeAutoPlay()
            } else {
                this._script.onAutoPlayStop(false)
            }
        }
    }
    get fastForwarding() { return this._ffwStop != null }

    get paused() { return this._pauseRequested || this._resume != undefined }

//#endregion ###################################################################
//#region                          CONSTRUCTOR
//##############################################################################

    constructor(script: SPB<LabelName>, label: LabelName,
                initPage: number = 0, onScriptLoaded: VoidFunction,
                onFinish: BlockFinishCallback) {
        this._script = script
        this._label = label
        this._page = initPage
        this._lineIndex = -1
        this._blockLines = []
        this._onFinish = onFinish
        this._script.fetchLines(label).then((lines: string[]) => {
            this._blockLines = lines
            if (this._lineIndex == -1)
                this._lineIndex = this._getLineIndex(this._page)
            onScriptLoaded()
        })
    }
    
//#endregion ###################################################################
//#region                        PUBLIC METHODS
//##############################################################################

    next() {
        this._currCmd?.next()
    }
    ffw(predicate: null): void
    ffw(predicate: FFwStopPredicate<any>, delay?: number): void
    ffw(predicate: FFwStopPredicate<any> | null, delay: number = 0) {
        if (this._ffwStop) {
            if (!predicate) {
                this._script.onAutoPlayStop(true)
            }
            this._ffwStop = predicate
            this._ffwDelay = delay
        } else {
            if (predicate) {
                if (this._autoPlay) {
                    this._autoPlay = false
                    this._script.onAutoPlayStop(false)
                }
                this._ffwStop = predicate
                this._script.onAutoPlayStart(true)
                this._ffwDelay = delay
            }
        }
        if (this._ffwStop)
            this.next()
    }
    start() {
        if (!this._started) {
            this._started = true
            this._processBlock()
        }
    }
    stop() {
        this._stopped = true
    }
    isCurrentLineText() {
        return this._currLine?.startsWith('`') ?? false
    }
    skip(nb_lines: number) {
        this._lineIndex += nb_lines
    }
    pause() {
        this._pauseRequested = true
    }
    resume() {
        if (this._pauseRequested)
            this._pauseRequested = false
        this._resume?.()
    }

//#endregion ###################################################################
//#region                        PRIVATE METHODS
//##############################################################################
    private isPageBreak(line: string, lineIndex: number, playing: boolean) {
        return this._script.isLinePageBreak(line, lineIndex, this._blockLines,
            this._label, playing)
    }
    
    private _getLineIndex(page: number) {
        if (page == 0)
            return 0
        let p = 0
        for (const [i, line] of this._blockLines.entries()) {
            if (this.isPageBreak(line, i, false)) {
                p += 1
                if (p == page)
                    return i+1
            }
        }
        return this._blockLines.length // return end of file if not enough pages
    }

    private _makeAutoPlay() {
        const cmd = this._currCmd
        if (!cmd)
            return
        const ffw = this._ffwStop != null
        if (!ffw && typeof cmd.autoPlayDelay != "number")
            return
        const next = cmd?.next.bind(cmd)
        const delay = ffw ? this._ffwDelay : cmd.autoPlayDelay as number
        const timer = new Timer(delay, () => {
            if (this.autoPlay)
                next?.()
        })
        timer.start()
        cmd.next = () => { timer.cancel(); next?.() }
        //const skip = skipCommand
        //skipCommand = ()=> {
        //    timer.cancel()
        //    skip?.()
        //}
    }

//_______________________________process script_________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    private async _processLine(line: string) {
        const instructions = extractInstructions(line)
        for (let i = 0; i < instructions.length && !this._stopped; i++) {
            const { cmd = '', arg = '',
                    handler = this._script.getCommand(cmd)
                } = instructions[i]
            //console.debug(`${cmd}(${arg})`)
            if (handler) {
                await new Promise<void>(resolve => {
                    let commandResult = handler(arg, cmd, this._script, resolve)
                    if (Array.isArray(commandResult)) {
                        instructions.splice(i + 1, 0, ...commandResult)
                        this._currCmd = null
                        resolve()
                    } else if (commandResult) {
                        this._currCmd = commandResult
                        //skipCommand = resolve // if the command must be skipped at some point
                        if (this.autoPlay)
                            this._makeAutoPlay()
                    }
                    else
                        resolve()
                })
                this._currCmd = null
                //skipCommand = undefined
            }
            else if (handler === undefined) {
                const { _label: lbl, _lineIndex: index } = this
                console.error(`unknown command ${lbl}:${index}: ${line}`)
                debugger
            }
            if (this._pauseRequested) {
                this._pauseRequested = false
                await new Promise<void>(resolve=> {this._resume = resolve})
                this._resume = undefined
            }
        }
    }

    private async _processBlock() {
        if (this._lineIndex == -1)
            throw Error(`block not loaded`)
        const {_label: label, _blockLines: lines} = this
        this._script.onBlockStart(label, this._page)
        let newPage = true
        while (this._lineIndex < this._blockLines.length && !this._stopped) {
            const index = this._lineIndex

            let line = lines[index]
            console.debug(`${label}:${this._page}|${index}: ${line}`)
            if (newPage) {
                this._script.onPageStart(line, index, lines, label)
                newPage = false
            }

            if (this._ffwStop?.(line, index, this._page, lines, this._label, this._script))
                this.autoPlay = false

            await this._processLine(line)
            if (this.isPageBreak(line, index, true)) {
                this._script.onPageEnd(line, index, lines, label)
                this.page++
                newPage = true
            }
            if (this._lineIndex == index) // if no line skip, move to next line
                this._lineIndex++
        }
        if (!this._stopped) {
            if (!newPage)
                this._script.onPageEnd('return', lines.length, lines, label)
            this._onFinish(true)
            this._script.onBlockEnd(label)
        } else {
            this._onFinish(false)
        }
        this._started = false
    }

//#endregion
//##############################################################################

}
