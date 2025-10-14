import { DivProps, SpritePos } from "../types";
import { bb } from "../utils/Bbcode";
import { splitFirst } from "../utils/utils";
import classNames from "classnames";
import { ReactNode } from "react";

type Props = {
	pos: SpritePos
	image: string
	getUrl: (img: string) => string
	blur?: boolean | ((img: string) => boolean)
	lazy?: boolean
	props?: DivProps
}

const GraphicElement = ({ pos, image, getUrl, blur: rawBlur = false, lazy = false, props: extraProps = {} }: Props) => {
	image = image || (pos == "bg" ? "#000000" : "#00000000")
	if (image.startsWith('"')) image = image.replaceAll('"', '')
	
	const isColor = image.startsWith("#")
	let text
	[image, text] = splitFirst(image, "$")

	let imageElement: ReactNode
	let overlay: ReactNode

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

		imageElement = (
			<img
				src={imgUrl}
				alt={alt}
				draggable={false}
				className={classNames({ blur })}
				{...(lazy ? { loading: "lazy" } : {})}
			/>
		)
	}

	if (text) {
		const match = text.match(/^(?<vAlign>[tcb])?`(?<str>[^`]*)`/)
		const { vAlign, str } = match?.groups ?? {}
		overlay = (
			<div
				className="text"
				{...{
					"vertical-align": vAlign ?? "c",
				}}
			>
				{bb(str ?? "[color=red][u]/!\\ Ill-formed text")}
			</div>
		)
	}

	return (
		<div
			{...extraProps}
			className={classNames(pos, extraProps.className)}
		>
			{imageElement}
			{overlay}
		</div>
	)
}

export default GraphicElement