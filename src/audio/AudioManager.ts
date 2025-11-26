import { AssetsMap } from "../utils/AssetsMap"
import { asyncDelay } from "../utils/timer"
import { AudioSourceNode, Sound} from "./AudioSourceNode"
import { AutoMuteAudioContext } from "./AutoMuteContext"

const effects: Record<string, Sound> = {
    'glass' : {
        osc: [
            //{ type: 'sine', freq: [2000, [0.1, 1000, 'exp']] },
            { type: 'sine', freq: 1800 },
            //{ type: 'sine', freq: 1810 }
        ],
        gain: [1, [0.1, 0, 'exp']],
        stop: 0.15
    },
    'impact': {
        osc: [
            { type: 'sine', freq: [800, [0.08, 400, 'exp']] }
        ],
        gain: [1, [0.08, 0, 'exp']],
        stop: 0.15
    },
    'tick': {
        osc: [
            { type: 'sine', freq: [8285, [0.1, 10000, 'lin']] }
        ],
        gain: [0.33, [0.1, 0, 'exp']],
        stop: 0.1
    },
    'click': {
        osc: [
            { type: 'triangle', freq: [150, [0.3, 0.01, 'exp']] }
        ],
        gain: [1, [0.3, 0, 'exp']],
        stop: 0.4
    }
}

//#endregion ###################################################################
//#region                        AudioAssetsMap
//##############################################################################

export class AudioAssetsMap<Key> extends AssetsMap<Key, AudioBuffer> {
    
    constructor(context: AudioContext, id2url: (id: Key)=>string) {
        super((AudioAssetsMap._createAudioBuffer<Key>)
            .bind(undefined, context, id2url))
    }

    private static async _createAudioBuffer<Key>(context: AudioContext,
            id2url: (id: Key)=>string, id: Key) {
        const path = id2url(id) ?? id
        const result = await fetch(path)
        if (!result.ok)
            throw Error(`audio file ${path} not found: ${result.statusText}`)
        const data = await result.arrayBuffer()
        const buffer = await context.decodeAudioData(data)
        return buffer as AudioBuffer
    }
}

//#endregion ###################################################################
//#region                       AudioManager
//##############################################################################

export class AudioManager {
    private _assetsMap: AudioAssetsMap<string>
    private _trackFadeout: number
    private _gameTrack: string | null
    private _menuTrack: string | null
    private _waveLoop: string | null
    private _uiVolume: number
    private _context: AutoMuteAudioContext
    private _masterGainNode: GainNode
    private _gameTrackNode: AudioSourceNode
    private _waveNode: AudioSourceNode
    private _menuTrackNode: AudioSourceNode
    private _uiNodes: Array<AudioSourceNode>

    constructor(idToUrl: (id: string) => string) {
        this._trackFadeout = 0
        this._gameTrack = null
        this._menuTrack = null
        this._waveLoop = null
        this._context = new AutoMuteAudioContext(false)
        this._masterGainNode = this._context.createGain()
        this._assetsMap = new AudioAssetsMap(this._context, idToUrl)
        this._gameTrackNode = new AudioSourceNode(this._context)
        this._menuTrackNode = new AudioSourceNode(this._context)
        this._waveNode = new AudioSourceNode(this._context)
        this._uiNodes = new Array<AudioSourceNode>()
        this._uiVolume = 1
        this._gameTrackNode.connect(this._masterGainNode)
        this._menuTrackNode.connect(this._masterGainNode)
        this._waveNode.connect(this._masterGainNode)
        this._masterGainNode.connect(this._context.destination)
    }
    
    get autoMute() { return this._context.autoMute }
    set autoMute(value: boolean) {
        this._context.autoMute = value
    }
    
    get masterVolume() { return this._masterGainNode.gain.value }
    set masterVolume(value: number) {
        this._masterGainNode.gain.value = value
    }
    
    get gameTrackVolume() { return this._gameTrackNode.gain.value }
    set gameTrackVolume(value: number) {
        this._gameTrackNode.gain.value = value
    }
    
    get menuTrackVolume() { return this._menuTrackNode.gain.value }
    set menuTrackVolume(value: number) {
        this._menuTrackNode.gain.value = value
    }
    
    get waveVolume() { return this._waveNode.gain.value }
    set waveVolume(value: number) {
        this._waveNode.gain.value = value
    }
    
    get uiVolume() { return this._uiVolume }
    set uiVolume(value: number) {
        this._uiVolume = value
        for (const node of this._uiNodes)
            node.gain.value = value
    }

    get trackFadeout() { return this._trackFadeout }
    set trackFadeout(value: number) {
        this._trackFadeout = value
    }

    get gameTrack() { return this._gameTrack }
    set gameTrack(id: string | null) {
        if (id)
            this.playGameTrack(id)
        else
            this.stopGameTrack()
    }

    get menuTrack() { return this._menuTrack }
    set menuTrack(id: string | null) {
        if (id)
            this.playMenuTrack(id)
        else
            this.stopMenuTrack()
    }
    get waveLoop() { return this._waveLoop }
    set waveLoop(id: string | null) {
        if (id)
            this.playWave(id, true)
        else
            this.stopWave()
    }
    
    set wave(id: string) {
        this.playWave(id, false)
    }
    
    playUiSound(id: keyof typeof effects, gainFactor: number = 1) {
        if (this._context.state != 'running')
            return
        let node = null
        for (const n of this._uiNodes) {
            if (!n.playing) {
                node = n
                break
            }
        }
        if (!node) {
            node = new AudioSourceNode(this._context, {
                gain: this._uiVolume * gainFactor})
            node.connect(this._masterGainNode)
        }
        node.gain.value = this._uiVolume * gainFactor
        node.play(effects[id], 0.05) // small delay to avoid clicking sound
        this._uiNodes.push(node)
    }

    async playGameTrack(id: string, forceRestart = false) {
        if (!forceRestart && this._gameTrack == id)
            return
        this._gameTrack = id
        const buffer = await this._assetsMap.get(id)
        await this.stopGameTrack()
        if (this._gameTrack == id) { // check if track has not changed during delays
            this._gameTrackNode.play({buffer, loop: true})
        }
    }
    
    async stopGameTrack() {
        if (this._gameTrackNode.playing) {
            if (this._trackFadeout) {
                this._gameTrackNode.gainRamp(0, this._trackFadeout)
                await asyncDelay(this._trackFadeout)
            }
            this._gameTrackNode.stop()
        }
        this._gameTrack = null
    }

    async playMenuTrack(id: string, forceRestart = false) {
        if (!forceRestart && this._menuTrack == id)
            return
        this._menuTrack = id
        const buffer = await this._assetsMap.get(id)
        await this.stopGameTrack()
        if (this._menuTrack == id) { // check if track has not changed during delays
            this._menuTrackNode.play({buffer, loop: true})
        }
    }
    
    async stopMenuTrack() {
        if (this._menuTrackNode.playing) {
            if (this._trackFadeout) {
                this._menuTrackNode.gainRamp(0, this._trackFadeout)
                await asyncDelay(this._trackFadeout)
            }
            this._menuTrackNode.stop()
        }
        this._menuTrack = null
    }
    
    async playWave(id: string, loop: boolean = false) {
        if (loop && this._waveLoop == id)
            return
        if (loop) {
            if (this._waveLoop == id)
                return
            this._waveLoop = id
        } else {
            if (this._waveLoop)
                this.stopWave()
            this._waveLoop = null
        }
        const buffer = await this._assetsMap.get(id)
        if (loop && this._waveLoop != id)
            return // looped se changed while loading buffer
        this._waveNode.play({buffer, loop})
    }

    stopWave() {
        if (this._waveNode.playing) {
            this._waveNode.stop()
        }
        this._waveLoop = null
    }

    clearBuffers(restartTrack: boolean = false) {
        this._assetsMap.clear()
        if (restartTrack) {
            if (this._gameTrackNode.playing && this._gameTrack)
                this.playGameTrack(this._gameTrack, true)
            if (this._menuTrackNode.playing && this._menuTrack)
                this.playMenuTrack(this._menuTrack, true)
        }
    }
}

//#endregion ###################################################################
