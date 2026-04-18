import { memo } from "react"
import GraphicsElement from "./GraphicsElement"
import { useGraphicTransition } from "../../hooks"
import { GraphicsTransition, Rocket, SpritePos } from "../types"

type SpriteGraphicsProps = {
	pos: Exclude<SpritePos, 'bg'>
	image: string
	transition?: GraphicsTransition
	rocket?: Rocket
	topLayer?: boolean
}

//.......... l, c, r sprites ...........
const SpriteGraphics = ({pos, image, transition, rocket, topLayer = false}: SpriteGraphicsProps)=> {
	const {
		img: currImg, prev: prevImg,
		duration: fadeTime, effect, onAnimationEnd
	} = useGraphicTransition(pos, image, transition)
	const topLayerClass = topLayer ? "top-layer" : undefined

	if (prevImg == undefined) // not loaded or no change
		return (
			<GraphicsElement
				key={currImg}
				pos={pos}
				image={currImg}
				rocket={rocket}
				className={topLayerClass}
			/>
		)
	return <>
		<GraphicsElement
			key={prevImg}
			pos={pos}
			image={prevImg}
			fadeOut={effect}
			fadeTime={fadeTime}
			toImg={currImg}
			onAnimationEnd={onAnimationEnd}
			className={topLayerClass}
		/>
		<GraphicsElement
			key={currImg}
			pos={pos}
			image={currImg}
			fadeIn={effect}
			fadeTime={fadeTime}
			onAnimationEnd={onAnimationEnd}
			rocket={rocket}
			className={topLayerClass}
		/>
	</>
}

export default memo(SpriteGraphics)