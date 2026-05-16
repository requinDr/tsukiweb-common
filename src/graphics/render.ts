import { CSSProperties } from "react"
import { Rocket } from "./types"


type EffectRenderProps = {
	className?: string
	style?: CSSProperties
}
export function buildEffectProps(
	effects: {monochrome?: string},
	className?: string,
	style?: CSSProperties,
): EffectRenderProps {
	const effectClasses: string[] = []
	const effectStyles: Record<string, any> = { ...style }

	if (effects.monochrome) {
		effectClasses.push('monochrome')
		effectStyles['--monochrome-color'] = effects.monochrome
	}

	return {
		className: [className, ...effectClasses].filter(Boolean).join(' ') || undefined,
		style: effectStyles as CSSProperties,
	}
}


type RocketRenderProps = {
	className: string
	style: CSSProperties
	onAnimationEnd: VoidFunction
}
export function buildRocketProps(rocket: Rocket): RocketRenderProps {
	return {
		className: 'rocket',
		style: {
			'--rocket-my': `${rocket.my}px`,
			'--rocket-magnify': rocket.magnify,
			'--rocket-duration': `${rocket.time}ms`,
			'--rocket-accel': rocket.accel,
			'--rocket-opacity': rocket.opacity / 255,
		} as CSSProperties,
		onAnimationEnd: rocket.onAnimationEnd,
	}
}