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
	const layerProps = (img: string) => rp && rocket?.image == img ? {
		className: classNames(topLayerClass, rp.className),
		style: rp.style,
		onAnimationEnd: rp.onAnimationEnd,
	} : { className: topLayerClass }

	if (prevImg == undefined) // not loaded or no change
		return <>
			<TransitionGraphic
				key={currImg}
				pos={pos}
				image={currImg}
				{...layerProps(currImg)}
			/>
		</>
	return <>
		<TransitionGraphic
			key={prevImg}
			pos={pos}
			image={prevImg}
			effect={effect}
			phase='out'
			fadeTime={fadeTime}
			toImg={currImg}
			onFinish={currImg ? undefined : onAnimationEnd}
			{...layerProps(prevImg)}
		/>
		<TransitionGraphic
			key={currImg}
			pos={pos}
			image={currImg}
			effect={effect}
			phase='in'
			fadeTime={fadeTime}
			onFinish={onAnimationEnd}
			{...layerProps(currImg)}
		/>
	</>
}

export default memo(SpriteGraphics)
