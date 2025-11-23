
type AudioParamSequence = number | [initValue: number,
    ...[time: number, value: number, rampType?: 'lin'|'exp'][]
]

export type Sound = {
    buffer: AudioBuffer
    loop?: boolean
} | {
    osc: Array<{
        type: OscillatorType,
        freq: AudioParamSequence
    }>
    gain: AudioParamSequence
    stop: number
}

function applyAudioParamSequence(param: AudioParam,
        sequence: AudioParamSequence, timeOffset: number = 0, valueOffset = 0,
        timeFactor: number = 1, valueFactor: number = 1) {
    param.cancelScheduledValues(timeOffset)
    if (typeof sequence == 'number') {
        param.value = sequence * valueFactor + valueOffset
    } else {
        const [init, ...next] = sequence
        param.setValueAtTime(init * valueFactor + valueOffset, timeOffset)
        for (let [time, value, type] of next) {
            value = value * valueFactor + valueOffset
            time = time * timeFactor + timeOffset
            switch(type) {
                case 'lin' :
                    param.linearRampToValueAtTime(value, time)
                    break
                case 'exp' :
                    if (value <= 0) value = 1e-9 // value must be > 0
                    param.exponentialRampToValueAtTime(value, time)
                    break
                default :
                    param.setValueAtTime(value, time)
                    break
            }
        }
    }
}

export class AudioSourceNode extends GainNode {
    private _descriptor: Sound | null
    private _oscillators: OscillatorNode[]
    private _oscGainNode: GainNode | null
    private _bufferNode: AudioBufferSourceNode | null
    private _onEnded: VoidFunction

    constructor(context: AudioContext, options ?: GainOptions) {
        super(context, options)
        this._descriptor = null
        this._oscillators = []
        this._oscGainNode = null
        this._bufferNode = null
        this._onEnded = this.stop.bind(this)
    }
    
    get numberOfInputs() { return 0 }

    get playing() {
        return this._descriptor != null
    }

    stop() {
        this._descriptor = null
        if (this._bufferNode) {
            this._bufferNode.stop()
            this._bufferNode.disconnect()
            this._bufferNode = null
        }
        else if (this._oscillators.length > 0) {
            for (const osc of this._oscillators) {
                osc.stop()
                osc.disconnect()
            }
            this._oscillators.splice(0)
            if (this._oscGainNode) {
                this._oscGainNode.disconnect()
                this._oscGainNode = null
            }
        }
    }
    play(descriptor: Sound | null, delay: number = 0) {
        if (this._descriptor)
            this.stop()
        this._descriptor = descriptor
        const start = this.context.currentTime + delay
        if (descriptor) {
            if ('buffer' in descriptor) {
                const {buffer, loop = false} = descriptor
                this._bufferNode = this.context.createBufferSource()
                this._bufferNode.buffer = buffer
                this._bufferNode.loop = loop
                this._bufferNode.connect(this)
                if (!loop)
                    this._bufferNode.onended = this._onEnded
                this._bufferNode.start(start)
            } else if ('osc' in descriptor) {
                const {osc, gain, stop} = descriptor
                this._oscGainNode = this.context.createGain()
                this._oscGainNode.connect(this)
                applyAudioParamSequence(this._oscGainNode.gain, gain, start)
                for (const {type, freq} of osc) {
                    const node = this.context.createOscillator()
                    node.connect(this._oscGainNode)
                    node.type = type
                    applyAudioParamSequence(node.frequency, freq, start)
                    node.start(start)
                    node.stop(start + stop)
                    this._oscillators.push(node)
                }
                this._oscillators[0].onended = this._onEnded
            }
        }
    }
    gainRamp(to: number, duration: number, exponential: boolean = false,
             delay: number = 0) {
        const start = this.context.currentTime + delay
        const end = start + duration
        this.gain.setValueAtTime(this.gain.value, start)
        if (exponential)
            this.gain.exponentialRampToValueAtTime(to, end)
        else
            this.gain.linearRampToValueAtTime(to, end)
    }

}