import { memo } from "react"
import classNames from "classnames"
import TransitionGraphic from "./TransitionGraphic"
import { GraphicsTransition, Rocket, SpritePos } from "../types"
import { buildRocketProps } from "../render"
import { resolveGraphicTransition } from "../utils";

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
	} = resolveGraphicTransition(pos, image, transition)
	const rp = rocket ? buildRocketProps(rocket) : undefined
	const topLayerClass = topLayer ? "top-layer" : undefined

	if (prevImg == undefined) // not loaded or no change
		return (
			<TransitionGraphic
				key={currImg}
				pos={pos}
				image={currImg}
				className={classNames(topLayerClass, rp?.className)}
				style={rp?.style}
				onAnimationEnd={rp?.onAnimationEnd}
			/>
		)
	return <>
		<TransitionGraphic
			key={prevImg}
			pos={pos}
			image={prevImg}
			fadeOut={effect}
			fadeTime={fadeTime}
			toImg={currImg}
			onAnimationEnd={currImg ? undefined :onAnimationEnd}
			className={topLayerClass}
		/>
		<TransitionGraphic
			key={currImg}
			pos={pos}
			image={currImg}
			fadeIn={effect}
			fadeTime={fadeTime}
			onAnimationEnd={rp?.onAnimationEnd ?? onAnimationEnd}
			className={classNames(topLayerClass, rp?.className)}
			style={rp?.style}
		/>
	</>
}

export default memo(SpriteGraphics)