import { memo, useCallback } from "react"
import { POSITIONS } from "../constants";
import { SpritePos, Graphics as GraphicsType } from "../types";
import GraphicElement from "./GraphicElement";
import { ResolutionId } from "../../translation/lang";
import { useGameConfig } from "../../context";
import { DivProps } from "../../types";
import { buildEffectProps } from "../render";

type GraphicsGroupProps = DivProps & {
	images: Partial<GraphicsType>
	spriteAttrs?: Partial<Record<SpritePos, DivProps>> | ((pos:SpritePos)=>DivProps)
	resolution?: ResolutionId,
	lazy?: boolean,
}

const GraphicsGroup = ({
	images,
	spriteAttrs,
	resolution = "src",
	lazy = false,
	...props}: GraphicsGroupProps)=> {
	const { imageSrc, cg } = useGameConfig()
	let {style: rawStyle, className, ...attrs} = props
	const getUrl = useCallback((img: string) => imageSrc(img, resolution), [imageSrc, resolution])

	const effectProps = buildEffectProps({
		monochrome: images.monochrome,
	}, className, rawStyle)

	return (
		<div
			className={["graphics", effectProps.className].filter(Boolean).join(' ')}
			style={effectProps.style}
			{...attrs}
		>
			{POSITIONS.map(pos => images[pos] &&
				<GraphicElement
					key={pos}
					pos={pos}
					image={images[pos] ?? ''} {...(typeof spriteAttrs == 'function' ? spriteAttrs(pos)
							: spriteAttrs?.[pos] ?? {})}
					getUrl={getUrl}
					blur={cg.shouldBlur(images[pos] ?? '')}
					lazy={lazy}
				/>
			)}
		</div>
	)
}

export default memo(GraphicsGroup)