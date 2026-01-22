/**
 * Uses HTMLAudioElement for streaming playback
 * This allows audio to start playing before the file is fully downloaded.
 */
export class StreamingAudioNode extends GainNode {
	private _audioElement: HTMLAudioElement | null = null
	private _mediaSource: MediaElementAudioSourceNode | null = null
	private _url: string | null = null
	private _loop: boolean = false
	private _endPromises: VoidFunction[] = []

	constructor(context: AudioContext, options?: GainOptions) {
		super(context, options)
	}

	get numberOfInputs() { return 0 }

	get playing() {
		return this._audioElement != null && !this._audioElement.paused
	}

	get url() {
		return this._url
	}

	private _handleEnded = () => {
		if (!this._loop) this.stop()
	}

	async waitStop() {
		return new Promise<void>(resolve => {
			this._endPromises.push(resolve)
		})
	}

	stop() {
		if (this._audioElement) {
			this._audioElement.pause()
			this._audioElement.removeEventListener('ended', this._handleEnded)
			this._audioElement.src = ''
			this._audioElement = null
		}
		if (this._mediaSource) {
			this._mediaSource.disconnect()
			this._mediaSource = null
		}
		this._url = null
		this._loop = false

		const promises = this._endPromises.splice(0)
		promises.forEach(resolve => resolve())
	}

	async play(url: string, loop: boolean = false) {
		if (this._audioElement) {
			this.stop()
		}

		this._url = url
		this._loop = loop

		// Create new audio element for streaming
		this._audioElement = new Audio()
		this._audioElement.crossOrigin = 'anonymous'
		this._audioElement.preload = 'none'
		this._audioElement.loop = loop
		this._audioElement.src = url

		const audioContext = this.context as AudioContext
		this._mediaSource = audioContext.createMediaElementSource(this._audioElement)
		this._mediaSource.connect(this)

		// Add ended listener for non-looping tracks
		if (!loop) {
			this._audioElement.addEventListener('ended', this._handleEnded)
		}

		// Start playback
		try {
			await this._audioElement.play()
		} catch (error) {
			if (!(error instanceof DOMException)) throw error
			if (error.name === 'AbortError') return
			// autoplay blocked - wait for user interaction
			if (error.name === 'NotAllowedError') {
				const tryPlay = () => this._audioElement?.play().catch(() => {})
				document.addEventListener('click', tryPlay, { once: true })
				document.addEventListener('keydown', tryPlay, { once: true })
			} else {
				this.stop()
				throw error
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
