import { memo } from "react"
import GraphicsElement from "../graphics/GraphicsElement"
import { GraphicsTransition } from "../types"
import useGraphicTransition from "../hooks/useGraphicTransition"

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
	} = useGraphicTransition('bg', image, transition)

	if (prevImg === undefined) return null

	return (
		<GraphicsElement key={currImg}
			pos='bg'
			image={currImg}
			fadeTime={fadeTime}
			fadeIn={effect}
			onAnimationEnd={onAnimationEnd}
			bg-align={bgAlign}
		/>
	)
}

export default memo(ForegroundGraphics)