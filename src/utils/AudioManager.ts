//##############################################################################
//#region                      imports, constants
//##############################################################################

const autoPlayEnablingEvents = [
    'auxclick', 'click'    , 'contextmenu',
    'dblclick', 'mousedown', 'mouseup',
    'keydown' , 'keyup'    , 'touchend'
]

//#endregion ###################################################################
//#region                         AudioChannel
//##############################################################################

export class AudioChannel {

//______________________________private attributes______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    private _manager: AudioManager
    private _gain: GainNode | number
    private _sourceNode: AudioBufferSourceNode | null
    private _sourceId: string | null
    private _loop: boolean

//_________________________________constructor__________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    constructor(manager: AudioManager) {
        this._manager = manager
        this._gain = 1
        this._sourceNode = null
        this._sourceId = null
        this._loop = false
    }

//______________________________public properties_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    /**
     * {@link Audiocontext} used for the channel. Same as the parent
     * {@link AudioManager}.
     */
    get context(): AudioContext {
        return this._manager.context
    }
    /**
     * Volume multiplier.
     */
    get volume(): number {
        if (this._gain instanceof GainNode)
            return this._gain.gain.value
        else
            return this._gain
    }
    set volume(value: number) {
        if (this._gain instanceof GainNode)
            this._gain.gain.value = value
        else
            this._gain = value
    }

    /**
     * The {@link GainNode} used by the channel. Its output is connected to
     * the {@link AudioManager} gain node. When playing a sound, the output of
     * the {@link AudioBufferSourceNode} is connected to this node.
     */
    get gainNode() : GainNode {
        if (!(this._gain instanceof GainNode)) {
            // create Gain node and set the gain to the stored value
            const gain = this._gain
            this._gain = this.context.createGain()
            this._gain.gain.value = gain
            
            this._gain.connect(this._manager.outputNode)
        }
        return this._gain
    }

    /**
     * `true` if the audio buffer is currently playing, `false` otherwise.
     */
    get playing() {
        return this._sourceId != null
    }

//________________________________public methods________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    /**
     * Set the sound to play. If the channel is currently playing a different
     * sound, it is stopped and replaced by the specified one. If the channel is
     * currently playing the same sound it is stopped and restarted only if the
     * {@link forceRestart} parameter is set to `true`. The {@link loop}
     * parameter is applied anyway.
     * @param id id of the sound to play.
     * @param loop `true` if the sound must be looped when it reaches the end
     *          of the audio buffer, `false` otherwise. Defaults to `false`.
     * @param forceRestart `true` if the sound must be restarted if it is
     *          already playing, `false` otherwise. Defaults to `true`
     */
    async play(id: string, {loop = false, forceRestart = false} = {}) {
 
        const context = this.context
        this._sourceId = id
        this._loop = loop
    
        if (!forceRestart && this._sourceId == id && this._sourceNode) {
            this._sourceNode.loop = loop
            return;
        }
    
        if (this._sourceNode) {
            this._sourceNode.stop()
            this._sourceNode.disconnect()
            this._sourceNode = null
        }

        try {
            const buffer = await this._manager.loadAudioBuffer(id)
            if (!buffer) {
                console.error(`Unknown audio id ${id}`)
                return
            }
            const node: AudioBufferSourceNode = context.createBufferSource()
            node.buffer = await buffer
            node.loop = this._loop

            if (this._sourceId != id || loop != this._loop)
                // Source was changed while buffer was loading. Abort
                return
            if (this._sourceNode)
                // Source was loaded twice. Abort
                return
            this._sourceNode = node
            node.connect(this.gainNode)
            this._manager.resume()
            node.start()
            node.onended = () => {
                if (this._sourceNode == node) { // if node has not been replaced
                    this._sourceNode.disconnect()
                    this._sourceNode = null
                    if (this._sourceId == id)
                        this._sourceId = null
                }
            }
        } catch (e) {
            console.error(`Error playing audio id ${id}:`, e)
        }
    }

    /**
     * Restart the execution of audio buffer
     */
    restart() {
        if (this._sourceId) {
            this.play(this._sourceId, {loop: this._loop, forceRestart: true})
        }
    }

    /**
     * Stop playing the current sound.
     */
    stop() {
        this._sourceNode?.stop()
    }
}

//#endregion ###################################################################
//#region                         AudioManager
//##############################################################################

export class AudioManager {

//______________________________private attributes______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    private _context: AudioContext | null = null
    private _masterGain: GainNode | number = 1
    private _storedBuffers: Map<string, AudioBuffer | Promise<AudioBuffer>> = new Map()
    private _channels: Map<string, AudioChannel> = new Map()
    private _id2url: (id: string) => string
    private _autoMuteEn: boolean = false;
    private _autoMuted: boolean = false;
    private _autoMuteListener: ()=> void;

//_________________________________constructor__________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    /**
     * @param channels list of channel ids to create {@link AudioChannel}
     *          instances of.
     * @param soundIdToUrl mapping function, called to get the url for a sound id.
     */
    constructor(channels: Iterable<string>,
                soundIdToUrl: (id: string)=>string) {
        
        this._id2url = soundIdToUrl

        for (let ch of channels) {
            this._channels.set(ch, new AudioChannel(this))
        }

        this._autoMuteListener = (()=> {
            if (this._masterGain instanceof GainNode) {
                if (document.visibilityState == "hidden")
                    this._suspend()
                else
                    this._conditionalResume()
            }
        }).bind(this)
        
        const resume = ()=> {
            this.context.resume()
            for (const evt of autoPlayEnablingEvents)
                removeEventListener(evt, resume)
        }
        for (const evt of autoPlayEnablingEvents)
            addEventListener(evt, resume)
    }

//______________________________public properties_______________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    /**
     * {@link AudioContext} used for this instance and all children
     * {@link AudioChannel}
     */
    get context(): AudioContext {
        if (this._context == null)
            this._context = new AudioContext()
        return this._context
    }

    /**
     * Volume multiplier for the master output node.
     */
    get volume(): number {
        if (this._masterGain instanceof GainNode)
            return this._masterGain.gain.value
        else
            return this._masterGain
    }

    set volume(value: number) {
        if (this._masterGain instanceof GainNode)
            this._masterGain.gain.value = value
        else
            this._masterGain = value
    }

    /**
     * `true` if the underlying {@link AudioContext} is running,
     * `false` otherwise.
     */
    get playing() {
        return this.context.state == 'running'
    }

    /**
     * Output Gain node. All channels connect to this node.
     */
    get outputNode(): GainNode {
        if (!(this._masterGain instanceof GainNode)) {
            const gainValue = this._masterGain
            const context = this.context
            this._masterGain = context.createGain()
            this._masterGain.gain.value = gainValue
            this._masterGain.connect(context.destination)
            this._conditionalResume();
        }
        return this._masterGain
    }

//_______________________________private methods________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    private _conditionalResume() {
        if (this.playing)
            return;
        if (this._autoMuteEn && document.visibilityState == "hidden")
            return;
        this.context.resume();
    }

    private _suspend() {
        this.context.suspend();
    }

//________________________________public methods________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    
    /**
     * Suspend the execution of the audio channels
     */
    suspend() {
        this.context.suspend();
    }

    /**
     * Resume the execution of the audio channels
     */
    resume() {
        this._conditionalResume()
    }

    /**
     * Enable or disable muting the audio when the document visibility changes
     * to `"hidden"` (e.g., when switching to another tab) and enabling back
     * when it switches to `"visible"` (e.g., when switching back to this tab).
     * @param enable `true` to enable auto-mute, `false` to disable.
     *          Defaults to `true`
     */
    autoMute(enable: boolean = true) {
        if (enable == !!this._autoMuteEn)
            return
        this._autoMuteEn = enable
        if (enable)
            document.addEventListener("visibilitychange",
                this._autoMuteListener)
        else
            document.removeEventListener("visibilitychange",
                this._autoMuteListener)
    }

    /**
     * Get the channel of the specified id, as specified in the `channels`
     * parameter of the constructor.
     * @param id id of the channel to retrieve
     * @returns the {@link AudioChannel} instance for the specified id
     */
    getChannel(id: string): AudioChannel {
        const channel = this._channels.get(id)
        if (!channel) {
            throw new Error(`Unknown channel id ${id}`)
        }
        return channel
    }

    /**
     * Clear all the {@link AudioBuffer} that were previously loaded with
     * {@link loadAudioBuffer}. The audio buffers will need to be reloaded to
     * be used. The {@link restartChannels} can be set to `true` to restart all
     * channels currently playing sound, forcing reload of the current sound
     * ids.
     * @param restartChannels `true` to restart all channels, `false` otherwise.
     *          Defaults to `false`.
     */
    clearAudioBuffers(restartChannels: boolean = false) {
        this._storedBuffers.clear()
        if (restartChannels) {
            for (let ch of this._channels.values()) {
                ch.restart()
            }
        }
    }

    /**
     * Get the audiobuffer for the specified sound id. If the buffer is already
     * loaded and {@link forceReload} parameter is false (or unset), it is
     * directly returned. Otherwise, the mapping function provided in the
     * constructor is called to get the url to fetch the audio file from.
     * Once loaded, the audio buffer is stored for future usage.
     * While the buffer is being loaded and decoded, a promise is returned and
     * resolved with the buffer once it is loaded.
     * @param id id of the sound to load
     * @param forceReload `true` to dorce reloading the audio buffer even if
     *          it is already stored
     * @returns a promise resolved with the desired audio buffer
     */
    async loadAudioBuffer(id: string, forceReload: boolean = false): Promise<AudioBuffer> {
        if (!forceReload) {
          const storedBuffer = this._storedBuffers.get(id)
          if (storedBuffer)
            return storedBuffer
        }
    
        const path = this._id2url?.(id) ?? id
        let promisedBuffer: Promise<AudioBuffer>|AudioBuffer = fetch(path)
            .then(data=>data.arrayBuffer())
            .then(arrayBuffer=> this.context.decodeAudioData(arrayBuffer))
            .then(audioBuffer=>{
              promisedBuffer = audioBuffer
              this._storedBuffers.set(id, audioBuffer)
              return Promise.resolve(audioBuffer)
            })
            .catch(reason=>Promise.reject(reason))
        this._storedBuffers.set(id, promisedBuffer)
        return promisedBuffer
    }
}

//#endregion ###################################################################
//#region                       Shortcut classes
//##############################################################################

export class BasicAudioManager extends AudioManager {

    constructor(soundIdToUrl: (id: string)=>string) {
        super(['track', 'se'], soundIdToUrl)
    }

    get track() {
        return this.getChannel("track")
    }

    get se() {
        return this.getChannel("se")
    }
}

//#endregion ###################################################################
