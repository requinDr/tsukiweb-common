import { DivProps } from "../../types";
import { bb } from "../../utils/Bbcode";
import { splitFirst } from "../../utils/utils";
import classNames from "classnames";
import { AnimationEventHandler, ReactNode, useRef } from "react";
import { SpritePos, TransitionEffect, TransitionPhase } from "../types";
import AmbientBackdrop from "./AmbientBackdrop";

export type EffectProps = {
	'data-effect': TransitionEffect['kind']
	'data-dir'?: TransitionEffect['dir']
	'data-phase': TransitionPhase
	onAnimationEnd: AnimationEventHandler
}

type Props = {
	pos: SpritePos
	image: string
	getUrl: (img: string) => string
	blur?: boolean | ((img: string) => boolean)
	framed?: boolean | ((img: string) => boolean)
	lazy?: boolean
	effectProps?: EffectProps
	props?: DivProps
}

const GraphicElement = ({ pos, image, getUrl, blur: rawBlur = false, framed: rawFramed = false, lazy = false, effectProps, props: extraProps = {} }: Props) => {
	const imgRef = useRef<HTMLImageElement>(null)
	image = image || (pos == "bg" ? "#000000" : "#00000000")
	if (image.startsWith('"')) image = image.replaceAll('"', '')
	
	const isColor = image.startsWith("#")
	let text
	[image, text] = splitFirst(image, "$")

	let imageElement: ReactNode
	let overlay: ReactNode
	let framed = false
	const effectOnImg = pos != "bg" && !isColor

	if (isColor) {
		const { style, ...attrs } = extraProps
		extraProps = {
			...attrs,
			style: { background: image, ...(style ?? {}) },
		}
	} else {
		const imgUrl = getUrl(image)
		const alt = `[[sprite:${image}]]`
		const blur = typeof rawBlur === "function" ? rawBlur(image) : rawBlur
		framed = typeof rawFramed === "function" ? rawFramed(image) : rawFramed

		imageElement = <>
			<img
				ref={imgRef}
				src={imgUrl}
				alt={alt}
				draggable={false}
				className={classNames({ blur })}
				{...(effectOnImg ? effectProps : {})}
				{...(lazy ? { loading: "lazy", decoding: "async" } : {})}
			/>
			{framed && <AmbientBackdrop source={imgRef} image={image} />}
		</>
	}

	if (text) {
		const match = text.match(/^(?<vAlign>[tcb])?`(?<str>[^`]*)`/)
		const { vAlign, str } = match?.groups ?? {}
		overlay = (
			<div
				className="text"
				vertical-align={vAlign ?? "c"}
			>
				{bb(str ?? "[color=red][u]/!\\ Ill-formed text")}
			</div>
		)
	}

	return (
		<div
			{...extraProps}
			{...(effectOnImg ? {} : effectProps)}
			className={classNames(pos, { framed }, extraProps.className)}
		>
			{imageElement}
			{overlay}
		</div>
	)
}

export default GraphicElement