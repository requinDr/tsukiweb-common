import { BG_POSITIONS, POSITIONS } from "./constants"

export type SpritePos = typeof POSITIONS[number]

export type Graphics = Record<SpritePos, string> & {
	monochrome?: string
	bgAlign?: typeof BG_POSITIONS[number]
}

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
	layer: 'l' | 'c' | 'r'
	my: number
	magnify: number
	time: number
	accel: number
	opacity: number
	onAnimationEnd: VoidFunction
}