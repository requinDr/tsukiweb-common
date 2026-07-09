import { WithRequired } from "@tsukiweb-common/types";
import { BG_POSITIONS, POSITIONS, SPRITES_POSITIONS } from "./constants"

export type SpritePos = typeof POSITIONS[number]

export type Graphics = Record<SpritePos, string> & {
	monochrome?: string
	bgAlign?: typeof BG_POSITIONS[number]
}
export type ThumbnailsGraphics = WithRequired<Partial<Graphics>, 'bg'>

export type GraphicsTransition = {
	to: Partial<Graphics>
	effect: string
	duration: number
	onFinish: VoidFunction
}

export type Quake = {
	duration: number
	x: number
	y: number
	onFinish: VoidFunction
}

export type Rocket = {
	layer: typeof SPRITES_POSITIONS[number]
	my: number
	magnify: number
	time: number
	accel: number
	opacity: number
	onAnimationEnd: VoidFunction
}