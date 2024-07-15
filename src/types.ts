import { POSITIONS } from "./constants";

export type SpritePos = typeof POSITIONS[number]

export type Graphics = PartialRecord<SpritePos, string> & {
  monochrome ?: string
}

export type Background = {
  image: string,
  type: string,
}

export type Sprite = {
  image: string,
  type: string
}

export type KeysMatching<T extends object, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never
}[keyof T];

export type RecursivePartial<T> = T|{
  [P in keyof T]?: T[P] extends string|number|boolean|null ? T[P] : RecursivePartial<T[P]>
}
export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T
}

export type JSONPrimitive = string|number|boolean|null
export type JSONObject = {
  [key:string]: JSONPrimitive|JSONObject|Array<JSONPrimitive|JSONObject>
}

export type Digit = '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'
export type LcLetter = 'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'|'i'|'j'|'k'
      |'l'|'m'|'n'|'o'|'p'|'q'|'r'|'s'|'t'|'u'|'v'|'w'|'x'|'y'|'z'
export type UcLetter = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'
      |'L'|'M'|'N'|'O'|'P'|'Q'|'R'|'S'|'T'|'U'|'V'|'W'|'X'|'Y'|'Z'
export type Letter = LcLetter|UcLetter

export type DivProps = React.ComponentPropsWithoutRef<"div">


/****************/
/*   Flowchart	*/
/****************/
export type FcNodeAttrs = {
	col: number
	from: string[]
	cutAt?: number
	align?: string
}

export type FcSceneAttrs = FcNodeAttrs & {
	graph: Graphics
}