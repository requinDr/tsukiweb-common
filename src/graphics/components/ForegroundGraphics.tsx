import { memo } from "react"
import TransitionGraphic from "./TransitionGraphic"
import { GraphicsTransition } from "../types"
import { resolveGraphicTransition } from "../utils"

type Props = {
	image: string
	transition: GraphicsTransition|undefined
	bgAlign?: string
}
/**
 * used to make background transitions over the sprites
 */
const ForegroundGraphics = ({image, transition, bgAlign}: Props) => {
	const {
		img: currImg, prev: prevImg,
		duration: fadeTime, effect, onAnimationEnd
	} = resolveGraphicTransition('bg', image, transition, false)

	if (prevImg === undefined) return null
	if (currImg == prevImg && transition?.to.bgAlign && transition.effect.endsWith("scroll")) return null; // scroll animation only affects background

	return (
		<TransitionGraphic key={currImg}
			pos='bg'
			image={currImg}
			fadeTime={fadeTime}
			fadeIn={effect}
			onAnimationEnd={onAnimationEnd}
			bg-align={transition?.to.bgAlign ?? bgAlign}
		/>
	)
}

export default memo(ForegroundGraphics)