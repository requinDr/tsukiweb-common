export type ImageRedirect<format extends string> = {
	thumb: format,
	sd:format,
	hd: format
}

export type TextImage = {
  bg?: string,
} & (
  { top: string|string[], center?: never, bottom?: never } |
  { center: string|string[], top?: never, bottom?: never } |
  { bottom: string|string[], top?: never, center?: never }
)

export type ResolutionId = 'thumb'|'sd'|'hd'

export type TranslationId = string

export type UpdateDateFormat = `${number}-${number}-${number}` // YYYY-MM-DD

export type LangDesc = {
  'display-name': string
  'locale': string
  'last-update': UpdateDateFormat
  'dir': string
  'fallback'?: TranslationId
  'authors'?: string
}
