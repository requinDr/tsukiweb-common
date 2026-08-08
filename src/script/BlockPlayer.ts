
import Timer from "../utils/timer"
import { extractInstructions } from "./utils";
import { ScriptPlayerBase } from "./ScriptPlayer";
import { CommandHandler } from "./types";
import { line } from "motion/react-client";

type BlockFinishCallback =
    (complete: boolean)=> void

type SPB = ScriptPlayerBase<any, any, any, any, any>

export class BlockPlayer<SP extends SPB> {

//#endregion ###################################################################
//#region                         ATTRS & PROPS
//##############################################################################
    
//_____________________________private attributes_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    private _script: SP
    private _onFinish: (complete: boolean) => void
//---------------status-----------------
    private _stopped: boolean = false
    private _started: boolean = false
    private _pauseRequested: boolean = false
    private _resume: VoidFunction|undefined = undefined
//-------------block info---------------
    private _label: SP['currentLabel']
    private _blockPages: string[][]
//-------------progression--------------
    private _pageIndex: number
    private _lineIndex: number
    private _currCmd: CommandHandler | null = null
//-----------private setters------------
    private set pageIndex(value: number) {
        this._pageIndex = value
    }

//______________________________public properties_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    get label() { return this._label }
    get pageIndex() { return this._pageIndex }
    get lineIndex() { return this._lineIndex }
    get pages() { return this._blockPages }

    get loaded() { return this._blockPages.length > 0 }

    get paused() { return this._pauseRequested || this._resume != undefined }

//#endregion ###################################################################
//#region                          CONSTRUCTOR
//##############################################################################

    constructor(script: SP, label: SP['currentLabel'],
                initPage: number = 0, onScriptLoaded: VoidFunction,
                onFinish: BlockFinishCallback) {
        this._script = script
        this._label = label
        this._pageIndex = initPage
        this._lineIndex = -1
        this._blockPages = []
        this._onFinish = onFinish
        this._script.fetchLines(label).then((lines: string[]) => {            
            const pages: string[][] = [[]]
            for (const [index, line] of lines.entries()) {
                pages[pages.length-1].push(line)
                if (this._script.isLinePageBreak(line, index, lines, label))
                    pages.push([])
            }
            if (pages[pages.length-1].length == 0)
                pages.pop()
            this._blockPages = pages
            onScriptLoaded()
        })
    }
    
//#endregion ###################################################################
//#region                        PUBLIC METHODS
//##############################################################################

    next() {
        this._currCmd?.next()
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
    onAutoPlayChange() {
        if (this._script.autoPlay || this._script.fastForwarding)
            this._makeAutoPlay()
    }

//#endregion ###################################################################
//#region                        PRIVATE METHODS
//##############################################################################

    private _makeAutoPlay() {
        const cmd = this._currCmd
        if (!cmd)
            return
        const delay = this._script.fastForwarding ? this._script.ffwDelay : cmd.autoPlayDelay
        if (delay == undefined)
            return
        const next = cmd.next.bind(cmd)
        const timer = new Timer(delay, () => {
            if (this._script.autoPlay)
                next()
        })
        timer.start()
        cmd.next = () => { timer.cancel(); next() }
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
                        if (this._script.fastForwarding && this._script.ffwDelay == 0)
                            resolve();
                        else {
                            this._currCmd = commandResult
                            //skipCommand = resolve // if the command must be skipped at some point
                            if (this._script.autoPlay)
                                this._makeAutoPlay()
                        }
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
        if (this._blockPages.length == 0)
            throw Error(`block not loaded`)
        const {_label: label, _blockPages: pages, _pageIndex: startPage} = this
        
        await this._script.dispatchEvent('blockStart', label, startPage, pages)
        
        this._lineIndex = 0;
        while (this._pageIndex < pages.length) {
            const page = pages[this._pageIndex]
            await this._script.dispatchEvent('pageStart', this._pageIndex, pages, label)

            while (this._lineIndex >= 0 && this._lineIndex < page.length && !this._stopped) {
                const index = this._lineIndex
                const line = page[index]
                console.debug(`${label}:${this._pageIndex}|${index}: ${line}`)
                
                if (this._script.ffwStopCondition?.(line, index, this._pageIndex, pages, this._label, this._script))
                    this._script.ffw(null)

                await this._processLine(line)

                if (this._lineIndex == index) // if no line skip, move to next line
                    this._lineIndex++
            }
            if (this._stopped)
                break
            if (this._lineIndex > 0) {
                // only trigger 'pageEnd' event when finishing a page
                // (skipping back more than a page should never happen anyway)
                await this._script.dispatchEvent('pageEnd', this._pageIndex, pages, label)
                this._lineIndex -= page.length
                this._pageIndex++
            } else {
                this._pageIndex--;
                this._lineIndex += pages[this._pageIndex].length;
            }
        }
        if (this._stopped) {
            this._onFinish(false)
        } else {
            this._onFinish(true)
            await this._script.dispatchEvent('blockEnd', label)
        }
        this._started = false
    }

//#endregion
//##############################################################################

}
