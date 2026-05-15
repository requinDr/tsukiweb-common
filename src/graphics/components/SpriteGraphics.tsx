import { CSSProperties, memo } from "react"
import classNames from "classnames"
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

function rocketToProps(rocket: Rocket) {
	return {
		className: 'rocket',
		style: {
			'--rocket-my': `${rocket.my}px`, //maybe vh
			'--rocket-magnify': rocket.magnify,
			'--rocket-duration': `${rocket.time}ms`,
			'--rocket-accel': rocket.accel,
			'--rocket-opacity': rocket.opacity / 255,
		} as CSSProperties,
		onAnimationEnd: rocket.onAnimationEnd,
	}
}

//.......... l, c, r sprites ...........
const SpriteGraphics = ({pos, image, transition, rocket, topLayer = false}: SpriteGraphicsProps)=> {
	const {
		img: currImg, prev: prevImg,
		duration: fadeTime, effect, onAnimationEnd
	} = useGraphicTransition(pos, image, transition)
	const rp = rocket ? rocketToProps(rocket) : undefined
	const topLayerClass = topLayer ? "top-layer" : undefined

	if (prevImg == undefined) // not loaded or no change
		return (
			<GraphicsElement
				key={currImg}
				pos={pos}
				image={currImg}
				className={classNames(topLayerClass, rp?.className)}
				style={rp?.style}
				onAnimationEnd={rp?.onAnimationEnd}
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
			onAnimationEnd={rp?.onAnimationEnd ?? onAnimationEnd}
			className={classNames(topLayerClass, rp?.className)}
			style={rp?.style}
		/>
	</>
}

export default memo(SpriteGraphics)