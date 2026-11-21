import { useSyncExternalStore } from "react"
import { GamepadEvents } from "../input/gamepad"

export type InputDevice = "keyboard" | "gamepad"

let device: InputDevice = "keyboard"
const listeners = new Set<VoidFunction>()

function setDevice(next: InputDevice) {
	if (device === next)
		return
	device = next
	listeners.forEach(listener => listener())
}

const toKeyboard = () => setDevice("keyboard")
const toGamepad = () => setDevice("gamepad")

function subscribe(listener: VoidFunction) {
	if (listeners.size === 0) {
		window.addEventListener("keydown", toKeyboard, true)
		window.addEventListener("pointerdown", toKeyboard, true)
		window.addEventListener(GamepadEvents.BTN_PRESSED, toGamepad, true)
		window.addEventListener(GamepadEvents.AXIS_CHANGE, toGamepad, true)
	}
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
		if (listeners.size === 0) {
			window.removeEventListener("keydown", toKeyboard, true)
			window.removeEventListener("pointerdown", toKeyboard, true)
			window.removeEventListener(GamepadEvents.BTN_PRESSED, toGamepad, true)
			window.removeEventListener(GamepadEvents.AXIS_CHANGE, toGamepad, true)
		}
	}
}

export const useInputDevice = () => useSyncExternalStore(subscribe, () => device)
