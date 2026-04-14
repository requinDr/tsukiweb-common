import { memo, useCallback } from "react"
import { POSITIONS } from "../constants";
import { SpritePos, Graphics as GraphicsType } from "../types";
import GraphicElement from "./GraphicElement";
import { ResolutionId } from "../../utils/lang";
import { useGameConfig } from "../../context";
import { DivProps } from "../../types";

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
	const monochrome = images.monochrome ?? ""
	let {style, className, ...attrs} = props
	const classes = ['graphics']
	if (monochrome) {
		classes.push('monochrome')
		if (!style)
			style = {}
		style = {
			...style,
			...{'--monochrome-color': monochrome}
		}
	}
	if (className)
		classes.push(className)

	const getUrl = useCallback((img: string) => imageSrc(img, resolution), [resolution])

	return (
		<div className={classes.join(' ')} style={style} {...attrs}>
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