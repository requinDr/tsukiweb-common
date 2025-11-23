
const autoPlayEnablingEvents = [
    'auxclick', 'click'    , 'contextmenu',
    'dblclick', 'mousedown', 'mouseup',
    'keydown' , 'keyup'    , 'touchend'
]

/**
 * Extends the base {@link AudioContext} to add auto-mute feature, to
 * automatically mute the audio when the document visibility changes to
 * `"hidden"` (e.g., when switching to another tab) and unmute it
 * when it switches back to `"visible"` (e.g., when switching back to this tab).
 */
export class AutoMuteAudioContext extends AudioContext {

    private _autoMuteEnabled: boolean
    private _autoMuted: boolean
    private _listener: VoidFunction

    constructor(autoMute: boolean, contextOptions?: AudioContextOptions) {
        super(contextOptions)
        this._autoMuteEnabled = autoMute
        this._autoMuted = false
        this._listener = this._update.bind(this)
        
        const resume = ()=> {
            this.resume()
            for (const evt of autoPlayEnablingEvents)
                removeEventListener(evt, resume)
        }
        for (const evt of autoPlayEnablingEvents)
            addEventListener(evt, resume)
    }

    get autoMute() {
        return this._autoMuteEnabled
    }
    set autoMute(value: boolean) {
        if (value == !!this._autoMuteEnabled)
            return
        this._autoMuteEnabled = value
        if (value)
            document.addEventListener("visibilitychange", this._listener)
        else
            document.removeEventListener("visibilitychange", this._listener)
        this._update()
    }

    async resume() {
        let resume: boolean
        if (this.state == "closed") {
            return super.resume() // returns rejected promise
        } else if (!this._autoMuteEnabled) {
            // auto-mute feature disabled
            resume = true
        } else if (this._autoMuted || this.state != "suspended") {
            // resume has no effect if context is not suspended or if auto-muted
            resume = false
        } else if (document.visibilityState == "hidden") {
            // context was suspended manually, but window is hidden now,
            // context will be resumed when window is displayed again
            this._autoMuted = true
            resume = false
        } else {
            resume = true
        }
        if (resume) {
            return super.resume()
        }
    }

    private _update() {
        if (this._autoMuteEnabled && document.visibilityState == "hidden") {
            if (this.state == "running") {
                this.suspend()
                this._autoMuted = true
            }
        } else if (this._autoMuted) {
            this._autoMuted = false
            this.resume()
        }
    }
}