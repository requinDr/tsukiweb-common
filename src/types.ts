import { Choice } from "types";
import { POSITIONS } from "./constants";
import { PageType } from "utils/history";

//##############################################################################
//#region                          BASE TYPES
//##############################################################################

export type Primitive = string | number | boolean | undefined | null

export type Digit = '0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'
export type LcLetter = 'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'|'i'|'j'|'k'
      |'l'|'m'|'n'|'o'|'p'|'q'|'r'|'s'|'t'|'u'|'v'|'w'|'x'|'y'|'z'
export type UcLetter = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'
      |'L'|'M'|'N'|'O'|'P'|'Q'|'R'|'S'|'T'|'U'|'V'|'W'|'X'|'Y'|'Z'
export type Letter = LcLetter|UcLetter

export type KeysMatching<T extends object, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never
}[keyof T];

export type RecursivePartial<T> = T|{
  [P in keyof T]?:
    T[P] extends Primitive | Iterable<Primitive> ? T[P]
    : T[P] extends Array<any> ? Array<RecursivePartial<T[P][any]>>
    : RecursivePartial<T[P]>
}
export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T
}

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

type RequiredFieldsOnly<T> = {
  [K in keyof T as T[K] extends Required<T>[K] ? K : never]: T[K]
}
type OptionalFieldsOnly<T> = {
  [K in keyof T as T[K] extends Required<T>[K] ? never : K]?: T[K]
}
type OptionalUndefine<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: T[K]
}
type NonUndefinedFields<T> = {
  [K in keyof T as T[K] extends (Required<T>[K] | undefined) ? never : K]: T[K]
}

//#endregion ###################################################################
//#region                          JSON TYPES
//##############################################################################

type NonUndefinedKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K
}[keyof T]

type Defined<T> = Exclude<T, undefined>

type PartialJSONEntry<T extends any> =
  T extends JSONPrimitive | Array<any> ? T
  : T extends PartialJSON ? PartialJSON<T>
  : never

export type JSONPrimitive = Exclude<Primitive, undefined>
export type JSONObject = {
  [key: string]: JSONPrimitive | JSONObject | Array<JSONPrimitive | JSONObject>
}
export type JSONParent = JSONObject | (JSONPrimitive | JSONObject)[]

export type PartialJSON<T extends PartialJSON|JSONObject=JSONObject> = {
  [P in keyof T]?: (T[P] extends PartialJSON ? PartialJSON<T[P]> : T[P]) | never
}

export type JSONDiff<O extends PartialJSON<any>, R extends PartialJSON<any>> = {
  // non-optional keys of O that are not in R
	[K in Exclude<NonUndefinedKeys<O>, keyof R>]: O[K]
} & {
  // keys of O that are not in the previous set
  [K in Exclude<keyof O, Exclude<NonUndefinedKeys<O>, keyof R>>]?:
    K extends keyof R ?
      O[K] extends JSONPrimitive | undefined | Array<any> ? O[K] | R[K]
      : Defined<O[K]> extends PartialJSON ?
        Defined<R[K]> extends PartialJSON<Defined<O[K]>> ?
          JSONDiff<Defined<O[K]>, Defined<R[K]>>
        : never
      : never
    : O[K]
}

export type JSONMerge<T1 extends PartialJSON<any>, T2 extends PartialJSON<any>> =
  OptionalUndefine<{
    [K in (keyof T1 | keyof T2)]:
      K extends keyof T1 ?
        K extends keyof T2 ?
          T1[K] extends undefined ? T2[K]
          : T2[K] extends undefined ? T1[K]
          : Defined<T1[K]> extends JSONPrimitive | Array<any> ?
            undefined extends T1[K] ? Defined<T1[K]> | T2[K]
            : T1[K]
          : Defined<T1[K]> extends PartialJSON ?
            Defined<T2[K]> extends PartialJSON ?
              JSONMerge<
                (undefined extends T1[K] ? Partial<Defined<T1[K]>> : Defined<T1[K]>),
                (undefined extends T2[K] ? Partial<Defined<T2[K]>> : Defined<T2[K]>)
              >
            : Defined<T1[K]> | T2[K]
          : never
        : T1[K]
      : K extends keyof T2 ? T2[K]
      : never
  }>

export type SpritePos = typeof POSITIONS[number]

export type Graphics = Record<SpritePos, string> & {
  monochrome: string
}

export type Quake = {
	duration: number
	x: number
	y: number
	onFinish: VoidFunction
}

export type RocketProps = {
  layer: 'l' | 'c' | 'r';
  my: number;
  magnify: number;
  time: number;
  accel: number;
  opacity: number;
  onAnimationEnd: VoidFunction;
}

export type GraphicsTransition = {
  to: Partial<Graphics>
  effect: string
  duration: number
  onFinish: VoidFunction
}
export type NoMethods<T> = { [P in keyof T as T[P] extends Function ? never : P]: T[P] }

export type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  [x: `${string}-${string}`]: any
}

export type NumVarName = `%${string}`
export type StrVarName = `$${string}`
export type VarName = NumVarName | StrVarName

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