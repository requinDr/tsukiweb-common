import { GraphicsTransition, SpritePos } from "./types";

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
	effect: string
	onAnimationEnd: VoidFunction
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
		effect: transition.effect,
		onAnimationEnd: transition.onFinish
	}
}