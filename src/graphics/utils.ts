import { GraphicsTransition, SpritePos, TransitionEffect } from "./types";

type GraphicTransitionResult = {
	img: string
	prev: undefined
	duration?: undefined
	effect?: undefined
	onAnimationEnd?: undefined
} | {
	img: string,
	prev: string
	duration: number
	effect: TransitionEffect
	onAnimationEnd: VoidFunction
}

const DIRECTIONAL_EFFECTS: Record<string, TransitionEffect['kind']> = {
	shutter: 'shutter',
	cartain: 'shutter',
	scroll: 'scroll',
	maskcross: 'scroll',
}

export function parseEffect(effect: string): TransitionEffect {
	const match = effect.match(/^([lrtb])([a-z]+)$/)
	const kind = match && DIRECTIONAL_EFFECTS[match[2]]
	if (kind)
		return { kind, dir: match[1] as TransitionEffect['dir'] }
	switch (effect) {
		case 'ccircle': return { kind: 'fade' }
		case 'lcircle': return { kind: 'circle' }
		case 'lexpl': return { kind: 'explosion' }
		default: return { kind: 'crossfade' }
	}
}

export function resolveGraphicTransition(
	pos: SpritePos,
	image: string,
	transition?: GraphicsTransition,
	skipSameImg: boolean = true
): GraphicTransitionResult {
	const nextImg = transition?.to[pos]

	if (!transition || nextImg == undefined || (skipSameImg && nextImg == image))
		return { img: image, prev: undefined }

	return {
		img: nextImg,
		prev: image,
		duration: transition.duration,
		effect: parseEffect(transition.effect),
		onAnimationEnd: transition.onFinish
	}
}