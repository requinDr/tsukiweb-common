import { AssetsMap } from "../utils/AssetsMap"
import { asyncDelay } from "../utils/timer"
import { AudioSourceNode, Sound} from "./AudioSourceNode"
import { StreamingAudioNode } from "./StreamingAudioNode"
import { AutoMuteAudioContext } from "./AutoMuteContext"
import { observe } from "../utils/Observer";
import { calcGain } from "./utils";
import { Settings } from "../utils/settings";

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
    },
    'close': {
        osc: [
            { type: 'sine', freq: [800, [0.08, 400, 'exp']] }
        ],
        gain: [1, [0.08, 0, 'exp']],
        stop: 0.15
    },
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
    private _idToUrl: (id: string) => string
    private _trackFadeout: number
    private _track: string | null
    private _waveLoop: boolean
    private _wave: string | null // /!\ attr not updated when wave finishes.
    private _uiVolume: number
    private _context: AutoMuteAudioContext
    private _masterGainNode: GainNode
    private _trackNode: StreamingAudioNode|AudioSourceNode
    private _waveNode: AudioSourceNode
    private _uiNodes: Array<AudioSourceNode>

    constructor(idToUrl: (id: string) => string, enableAudioElements: boolean = false) {
        this._idToUrl = idToUrl
        this._trackFadeout = 0
        this._track = null
        this._waveLoop = false
        this._wave = null
        this._context = new AutoMuteAudioContext(false)
        this._masterGainNode = this._context.createGain()
        this._assetsMap = new AudioAssetsMap(this._context, idToUrl)
        if (enableAudioElements) {
            this._trackNode = new StreamingAudioNode(this._context)
        } else {
            this._trackNode = new AudioSourceNode(this._context)
        }
        this._waveNode = new AudioSourceNode(this._context)
        this._uiNodes = new Array<AudioSourceNode>()
        this._uiVolume = 1
        this._trackNode.connect(this._masterGainNode)
        this._waveNode.connect(this._masterGainNode)
        this._masterGainNode.connect(this._context.destination)
    }
    
    get autoMute() { return this._context.autoMute }
    set autoMute(value: boolean) {
        this._context.autoMute = value
    }
    
    get masterVolume() { return this._masterGainNode.gain.value }
    set masterVolume(value: number) {
        let previousVolume = this.masterVolume
        this._masterGainNode.gain.value = value
        if (previousVolume == 0) {
            if (this.trackVolume > 0 && this.track) this.playTrack(this.track)
            if (this.waveVolume > 0 && this.waveLoop) this.playWave(this.waveLoop, true)
        }
    }
    get trackVolume() { return this._trackNode.gain.value }
    set trackVolume(value: number) {
        let previousVolume = this.trackVolume
        this._trackNode.gain.value = value
        if (previousVolume == 0 && this.masterVolume > 0 && this.track)
            this.playTrack(this.track)
    }
    
    get waveVolume() { return this._waveNode.gain.value }
    set waveVolume(value: number) {
        let previousVolume = this.waveVolume
        this._waveNode.gain.value = value
        if (previousVolume == 0 && this.masterVolume > 0 && this.waveLoop)
            this.playWave(this.waveLoop, true)
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

    get track() { return this._track }
    set track(id: string | null) {
        if (id)
            this.playTrack(id)
        else
            this.stopTrack()
    }
    get waveLoop() { return this._waveLoop ? this._wave : null}
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

    async playTrack(id: string, forceRestart = false) {
        if (!forceRestart && this._track == id && this._trackNode.playing)
            return
        this._track = id
        if (this.trackVolume == 0 || this.masterVolume == 0)
            return
        await this._stopStreamingTrack(this._trackNode)
        if (this._track == id) { // check if track has not changed during delays
            if (this._trackNode instanceof StreamingAudioNode) {
                const url = this._idToUrl(id)
                await this._trackNode.play(url, true)
            } else {
                const buffer = await this._assetsMap.get(id)
                if (this._track == id) // check if track changed while loading buffer
                    this._trackNode.play({buffer, loop: true})
            }
        }
    }

    private async _stopStreamingTrack(node: StreamingAudioNode|AudioSourceNode) {
        if (node.playing) {
            if (this._trackFadeout) {
                node.gainRamp(0, this._trackFadeout)
                await asyncDelay(this._trackFadeout)
            }
            node.stop()
        }
    }
    
    async stopTrack() {
        this._track = null
        await this._stopStreamingTrack(this._trackNode)
    }
    
    async playWave(id: string, loop: boolean = false) {
        if (loop && this.waveLoop == id && (loop == this._waveLoop) && this._waveNode.playing)
            return
        this._wave = id
        this._waveLoop = loop
        if (this._waveNode.playing) {
            this._waveNode.stop()
            await this._waveNode.waitStop()
        }
        if (this.waveVolume == 0 || this.masterVolume == 0)
            return
        const buffer = await this._assetsMap.get(id)
        if (this._wave != id || this._waveLoop != loop )
            return // wave changed while stopping prev. one and loading buffer
        this._waveNode.play({buffer, loop})
    }

    async waitWaveEnd() {
        return this._waveNode.waitStop()
    }

    stopWave(wait = false) {
        if (this._wave || this._waveNode.playing) {
            this._waveNode.stop()
            if (wait)
                return this._waveNode.waitStop()
        }
        this._wave = null
        this._waveLoop = false
    }

    clearBuffers(restartTrack: boolean = false) {
        this._assetsMap.clear()
        if (restartTrack) {
            if (this._trackNode.playing && this._track)
                this.playTrack(this._track, true)
        }
    }
}

//#endregion ###################################################################
//#region                       GameAudio
//##############################################################################

export class GameAudioManager<S extends Settings> extends AudioManager {
    private _inGame: boolean = false
    private _settings: S

    constructor(settings: S, ...params: ConstructorParameters<typeof AudioManager>) {
        super(...params)
        this._settings = settings
        this._updateVolumes = this._updateVolumes.bind(this)
        this._updateVolumes()
        for (const attr of ['master', 'se', 'titleTrack', 'systemSE', 'track'] as const)
            observe(settings.volume, attr, this._updateVolumes)
        observe(settings, 'autoMute', (m) => { this.autoMute = m })
        this.autoMute = settings.autoMute
    }
    
    private _updateVolumes() {
        this.masterVolume = calcGain(this._settings.volume.master)
        this.uiVolume = calcGain(this._settings.volume.systemSE)
        this.waveVolume = calcGain(this._settings.volume.se)
        this.trackVolume = calcGain(
            (this._inGame) ? this._settings.volume.track
                           : this._settings.volume.titleTrack)
    }

    get inGame() { return this._inGame }
    set inGame(inGame: boolean) {
        if (inGame != this._inGame) {
            this._inGame = inGame
            this.stopTrack()
            this.stopWave()
            this._updateVolumes()
        }
    }
}

//#endregion ###################################################################

