import { AnimationEvent, CSSProperties, memo, useMemo } from "react"
import GraphicElement, { EffectProps } from "./GraphicElement";
import { SpritePos, TransitionEffect, TransitionPhase } from "../types"
import { ResolutionId } from "../../translation/lang";
import { isImage } from "../../utils/images";
import { useGameConfig } from "../../context";
import { DivProps } from "../../types";


type Props = {
	pos: SpritePos
	image: string
	resolution?: ResolutionId
	fadeTime?: number
	effect?: TransitionEffect
	phase?: TransitionPhase
	toImg?: string
	onFinish?: VoidFunction
} & DivProps

const TransitionGraphic = ({
	pos,
	image,
	resolution="src",
	fadeTime=0,
	effect,
	phase,
	toImg,
	onFinish,
	style,
	...rest}: Props)=> {
	const { imageSrc, cg } = useGameConfig()
	const getUrl = (img: string) => imageSrc(img, resolution)
	const framed = (pos === 'bg' && cg.shouldFrame) || false
	const animated = fadeTime > 0 && effect != undefined && phase != undefined

	const effectProps = useMemo<EffectProps|undefined>(()=> {
		if (!animated) return undefined
		return {
			'data-effect': effect.kind,
			'data-dir': effect.dir,
			'data-phase': phase,
			onAnimationEnd: (e: AnimationEvent)=> {
				e.stopPropagation()
				onFinish?.()
			}
		}
	}, [animated, effect, phase, onFinish])

	// add an opaque background to the crossfade-disappearing image to prevent
	// the background from being visible by transparency
	const crossfadeMask = animated && pos !== 'bg' && effect.kind == 'crossfade'
		&& phase == 'out' && toImg && isImage(image) && isImage(toImg)

	if (!image && pos !== 'bg')
		return null

	return (
		<>
			{crossfadeMask &&
				<GraphicElement
					pos={pos}
					image={image}
					getUrl={getUrl}
					blur={cg.shouldBlur}
					props={{
						'data-crossfade-mask': "",
						style: {
							'--from-image': `url(${imageSrc(image)})`,
							'--to-image': `url(${imageSrc(toImg)})`
						} as CSSProperties
					} as DivProps}
				/>
			}
			<GraphicElement
				pos={pos}
				image={image}
				getUrl={getUrl}
				blur={cg.shouldBlur}
				framed={framed}
				effectProps={effectProps}
				props={{
					...rest,
					style: animated
						? { '--transition-time': `${fadeTime}ms`, ...style } as CSSProperties
						: style
				}}
			/>
		</>
	)
}

export default memo(TransitionGraphic)