//##############################################################################
//#region                          EVENT TYPES
//##############################################################################

export enum GamepadEvents {
    BTN_PRESSED     = "gp_btnpressed",
    BTN_RELEASED    = "gp_btnreleased",
    BTN_TOUCHSTART  = "gp_btntouchstart",
    BTN_TOUCHEND    = "gp_btntouchend",
    BTN_CHANGE      = "gp_btnchange",
    AXIS_CHANGE     = "gp_axChange"
}

class GamepadInputEvent extends Event {
    private _gamepad: Gamepad
    constructor(evtType: GamepadEvents, gamepad: Gamepad) {
        super(evtType, {bubbles: true, cancelable: true, composed: true})
        this._gamepad = gamepad
    }
    get gamepad() { return this._gamepad }
}

export class GamepadButtonEvent extends GamepadInputEvent {
    private _btnId: number
    private _btnState: GamepadButton

    constructor(evtType: Exclude<GamepadEvents, GamepadEvents.AXIS_CHANGE>,
                gamepad: Gamepad, buttonId: number, state: GamepadButton) {
        super(evtType, gamepad)
        this._btnId = buttonId
        this._btnState = state
    }
    get buttonId() { return this._btnId }
    get buttonState() { return this._btnState }
}

export class GamepadAxisEvent extends GamepadInputEvent {
    private _axisId: number
    private _axisValue: number

    constructor(gamepad: Gamepad, axisId: number, axisValue: number) {
        super(GamepadEvents.AXIS_CHANGE, gamepad)
        this._axisId = axisId
        this._axisValue = axisValue
    }
    get axisId() { return this._axisId }
    get axisValue() { return this._axisValue }
}

//#endregion ###################################################################
//#region                       INTERNAL CLASSES
//##############################################################################

class GamepadState {
    public gamepad: Gamepad
    public buttons: {-readonly [K in keyof GamepadButton]: GamepadButton[K]}[]
    public axes: number[]
    constructor(gamepad: Gamepad) {
        this.gamepad = gamepad
        this.buttons = gamepad.buttons.map(btn=>({pressed: btn.pressed, touched: btn.touched, value: btn.value}))
        this.axes = [...gamepad.axes]
    }
    *updateButtons() {
        const pad = navigator.getGamepads()[this.gamepad.index]
        if (!pad)
            return
        for (const [i, btn] of pad.buttons.entries()) {
            if (btn.pressed != this.buttons[i].pressed || btn.touched != this.buttons[i].touched || btn.value != this.buttons[i].value) {
                yield [i, this.buttons[i], btn] as const
                this.buttons[i].pressed = btn.pressed
                this.buttons[i].touched = btn.touched
                this.buttons[i].value = btn.value
            }
        }
    }
    *updateAxes(deadzones: number|number[], resolution: number|number[]) {
        const pad = navigator.getGamepads()[this.gamepad.index]
        if (!pad)
            return
        for (let [i, value] of pad.axes.entries()) {
            let d = deadzones instanceof Array ?
                    (i < deadzones.length ? deadzones[i] : 0)
                    : deadzones
            if (Math.abs(value) < d) {
                value = 0
            } else {
                let r = resolution instanceof Array ?
                    (i < resolution.length ? resolution[i] : 0)
                    : resolution
                if (r > 0)
                    value = Math.round(value / r) * r
            }
            if (value != this.axes[i]) {
                yield [i, this.axes[i], value] as const
                this.axes[i] = value
            }
        }
    }
}

type Opts = {
    /** Absolute value, for each axis or for all axes, under which the axis
     * is considered as 0.
     * 
     * If an array is used, axes with indices outside this array
     * will be considered without dead zone.
     * 
     * By default, axes have no dead zone.
     */
    axesDeadZones?: number|number[],
    /** Axes resolution. If set to a strictly positive number, axis values
     * will be rounded to multiple of this number.
     * 
     * If an array is used, axes with indices outside this array
     * will be considered with native resolution.
     * 
     * By default, axes use native resolution.
     */
    axesResolution?: number|number[],
    /**
     * Period in ms, at which the program will poll the states of the gamepads.
     * 
     * If unset or set to 0, gamepad polling will happen on animation frames.
     */
    pollPeriod?: number
} & Partial<GamepadEventGeneratorClass['_eventsConfig']>

class GamepadEventGeneratorClass {
    private _gamepads: GamepadState[]
    private _pollInterval: number = 0
    private _poll: VoidFunction | null = null
    private _pollHandle: number = 0
    private _axesDeadZones: number|number[] = 0
    private _axesResolution: number|number[] = 0
    private _enabled: boolean = false

    private _eventsConfig: {
        /** Gamepad button press and release will trigger an event */
        btnPress: boolean,
        /** Gamepad button touch start and touch end will trigger an event
         * (for touch-capable gamepads) */
        btnTouch: boolean,
        /** Gamepad button value changes will trigger an event */
        btnValue: boolean,
        /** Gamepad axis value change will trigger an event */
        axisChange: boolean,
    }
    constructor() {
        this._gamepads = []
        this._onConnect = this._onConnect.bind(this)
        this._onDisconnect = this._onDisconnect.bind(this)
        this._eventsConfig = {
            btnPress: false, btnValue: false, btnTouch: false,
            axisChange: false
        }
    }
    private _onConnect(evt: GamepadEvent) {
        this._gamepads.push(new GamepadState(evt.gamepad))
        if (this._gamepads.length == 1) {
            this._startPolling()
        }
    }
    private _onDisconnect(evt: GamepadEvent) {
        const i = this._gamepads.findIndex(g=> g.gamepad.index == evt.gamepad.index)
        if (i < 0)
            return
        this._gamepads.splice(i, 1)
        if (this._gamepads.length == 0) {
            this._stopPolling()
        }
    }
    private _pollFunction() {
        if (this._pollInterval == 0 && this._poll)
            requestAnimationFrame(this._poll)
        const elmt = document.activeElement ?? window
        for (const pad of this._gamepads) {
            for (const [i, prevState, newState] of pad.updateButtons()) {
                if (this._eventsConfig.btnPress && newState.pressed != prevState.pressed) {
                    elmt.dispatchEvent(new GamepadButtonEvent(
                        newState.pressed ? GamepadEvents.BTN_PRESSED
                                         : GamepadEvents.BTN_RELEASED,
                        pad.gamepad, i, newState)
                    )
                }
                if (this._eventsConfig.btnTouch && newState.touched != prevState.touched) {
                    elmt.dispatchEvent(new GamepadButtonEvent(
                        newState.touched ? GamepadEvents.BTN_TOUCHSTART
                                         : GamepadEvents.BTN_TOUCHEND,
                        pad.gamepad, i, newState)
                    )
                }
                if (this._eventsConfig.btnValue && newState.value && !prevState.value) {
                    elmt.dispatchEvent(new GamepadButtonEvent(
                        GamepadEvents.BTN_CHANGE, pad.gamepad, i, newState
                    ))
                }
            }
            for (const [i, prevVal, newVal] of pad.updateAxes(this._axesDeadZones, this._axesResolution)) {
                if ((this._eventsConfig.axisChange) && newVal != prevVal) {
                    elmt.dispatchEvent(new GamepadAxisEvent(
                        pad.gamepad, i, newVal
                    ))
                }
            }
        }
    }
    private _startPolling(period: number = 0) {
        if (this._poll)
            this._stopPolling()
        
        this._pollInterval = period
        this._poll = this._pollFunction.bind(this)
        if (period == 0)
            this._pollHandle = requestAnimationFrame(this._poll)
        else
            this._pollHandle = setInterval(this._poll, period) as any as number
    }
    private _stopPolling() {
        if (this._poll) {
            if (this._pollInterval = 0)
                cancelAnimationFrame(this._pollHandle)
            else
                clearInterval(this._pollHandle)
            this._poll = null
        }
    }

    config({axesDeadZones, axesResolution, pollPeriod, ...config} : Opts) {
        this._axesDeadZones = axesDeadZones ?? this._axesDeadZones
        this._axesResolution = axesDeadZones ?? this._axesResolution
        this._pollInterval = pollPeriod ?? this._pollInterval
        Object.assign(this._eventsConfig, config)
    }

    enable() {
        if (!this._enabled) {
            this._enabled = true
            window.addEventListener("gamepadconnected", this._onConnect)
            window.addEventListener("gamepaddisconnected", this._onDisconnect)
        }
    }

    disable() {
        if (this._enabled) {
            this._enabled = false
            this._stopPolling()
            window.removeEventListener('gamepadconnected', this._onConnect)
            window.removeEventListener('gamepaddisconnected', this._onDisconnect)
        }
    }

    isEnabled() {
        return this._enabled
    }
}
const GamepadEventGenerator = new GamepadEventGeneratorClass()

export {
    GamepadEventGenerator
}