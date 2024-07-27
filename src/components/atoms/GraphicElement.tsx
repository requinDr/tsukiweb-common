import { DivProps, SpritePos } from "../../types";
import { bb } from "../../utils/Bbcode";
import { splitFirst } from "../../utils/utils";
import classNames from "classnames";

type Props = {
	pos: SpritePos
	image: string
	getUrl: (img: string) => string
	blur?: boolean | ((img: string) => boolean)
	lazy?: boolean
	props?: DivProps
}

const GraphicElement = ({ pos, image, getUrl, blur = false, lazy = false, props = {} }: Props) => {
	image = image || (pos == "bg" ? "#000000" : "#00000000")
	const isColor = image.startsWith("#")
	let text
	[image, text] = splitFirst(image, "$")

	let imageElement = undefined
	let overlay = undefined

	if (isColor) {
		const { style, ...attrs } = props
		props = {
			style: { background: image, ...(style ?? {}) },
			...attrs,
		};
	} else {
		const imgUrl = getUrl(image)
		const alt = `[[sprite:${image}]]`
		if (blur instanceof Function) {
			blur = blur(image) // GALLERY_IMAGES[image]?.sensitive && settings.blurThumbnails
		}
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
			{...props}
			className={classNames(pos, props.className)}
		>
			{imageElement}
			{overlay}
		</div>
	)
}

export default GraphicElement