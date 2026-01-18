import { useRef, useCallback } from 'react'
import type { MouseEventHandler, FocusEventHandler, HTMLAttributes } from 'react'
import { AudioManager } from '../audio/AudioManager'

interface ButtonSoundConfig {
	hoverSound?: string
	clickSound?: string
}

export const useButtonSounds = <T extends HTMLElement>(
	audio: AudioManager | undefined,
	originalProps: HTMLAttributes<T>,
	sounds: ButtonSoundConfig = {},
	throttle: number = 200 // 200ms before replaying hover sound after button appears or mouse leaves
) => {
	const { onMouseEnter, onMouseLeave, onFocus, onClick } = originalProps
	const { hoverSound, clickSound } = sounds
	const lastHoverRef = useRef<number>(Date.now())

	const handleSoundMouseEnter: MouseEventHandler<T> = useCallback((evt) => {
		const now = Date.now()
		if (audio && hoverSound && (now - lastHoverRef.current > throttle)) {
			audio.playUiSound(hoverSound)
			lastHoverRef.current = now
		}
		onMouseEnter?.(evt)
	}, [audio, hoverSound, throttle, onMouseEnter])

	const handleSoundMouseLeave: MouseEventHandler<T> = useCallback((evt) => {
		lastHoverRef.current = Date.now()
		onMouseLeave?.(evt)
	}, [onMouseLeave])

	const handleSoundFocus: FocusEventHandler<T> = useCallback((evt) => {
		if (audio && hoverSound && !evt.target.matches(':hover')) {
			audio.playUiSound(hoverSound)
		}
		onFocus?.(evt)
	}, [audio, hoverSound, onFocus])

	const handleSoundClick: MouseEventHandler<T> = useCallback((evt) => {
		if (audio && clickSound) {
			audio.playUiSound(clickSound)
		}
		onClick?.(evt)
	}, [audio, clickSound, onClick])

	return {
		...originalProps,
		onMouseEnter: handleSoundMouseEnter,
		onMouseLeave: handleSoundMouseLeave,
		onFocus: handleSoundFocus,
		onClick: handleSoundClick,
	}
}