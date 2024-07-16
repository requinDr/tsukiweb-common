import { SpritePos } from "@tsukiweb-common/types"
import { resettable, splitLast } from "./utils"

export const [transition, resetTransition] = resettable({
	effect: "",
	duration: 0,
	pos: "a" as SpritePos|'a',
})

export const [quakeEffect, resetQuake] = resettable({
	x: 0, y: 0,
	duration: 0,
})

export function getTransition(type: string, skipTransition = false) {
	let duration = 0
	let effect = type
	let speed: string|null

	if (effect.startsWith('type_')) {
		effect = effect.substring('type_'.length)
	}
	[effect, speed] = splitLast(effect, '_')
	if (speed != null && !skipTransition) {
		switch(speed) {
			case 'slw': duration = 1500; break
			case 'mid': duration =  800; break
			case 'fst': duration =  400; break
			default : throw Error(`Ill-formed effect '${type}'`)
		}
	}
	return {effect, duration}
}