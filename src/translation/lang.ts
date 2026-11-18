import { Entries } from "../types"

export type ImageRedirect<format extends string> = {
	thumb: format,
	hd: format
}

export type TextImage = {
	bg?: string,
} & (
	{ top: string|string[], center?: never, bottom?: never } |
	{ center: string|string[], top?: never, bottom?: never } |
	{ bottom: string|string[], top?: never, center?: never }
)

export type ResolutionId = 'thumb'|'src'

export type TranslationId = string

export type UpdateDateFormat = `${number}-${number}-${number}` // YYYY-MM-DD

export type LangDesc = {
	'display-name': string
	'locale': string
	'last-update': UpdateDateFormat
	'dir': string
	'fallback'?: TranslationId
}

export type LanguagesType = Record<TranslationId, LangDesc>

const LEADING_EMOJIS = /^\P{L}+/u
/** Compare language descriptors by display name, ignoring leading emojis */
const langCompare = ([, lang1]: [string, LangDesc], [, lang2]: [string, LangDesc]) =>
	lang1["display-name"].replace(LEADING_EMOJIS, '').localeCompare(
		lang2["display-name"].replace(LEADING_EMOJIS, ''))

/**
 * Sort the translations to match the specified locales order, then sort
 * the other translations alphabetically by display name.
 * @param translations - Object that maps translation ids to their description.
 * @param locales - List of locales to match with translation locales.
 * @returns The sorted list of translation ids and their descriptions.
 */
export function sortTranslations<T extends LanguagesType>(translations: T, locales = navigator.languages): Entries<T> {
	const entries = Object.entries(translations)
	const sorted = []
	for (const locale of locales) {
		let i = entries.findIndex(([, lang]) => lang.locale == locale)
		if (i == -1) {
			const language = locale.split('-')[0] + '-'
			i = entries.findIndex(([, lang]) => lang.locale.startsWith(language))
		}
		if (i != -1)
			sorted.push(...entries.splice(i, 1))
	}
	sorted.push(...entries.sort(langCompare))
	return sorted as Entries<T>
}
/**
 * Pick the translation id that best matches the specified locales.
 * @param translations - Object that maps translation ids to their description.
 * @params locales - List of locales to match with translation locales.
 * @returns The translation id that matches the best (lowest index) locale.
 */
export function pickDefaultTranslation<T extends LanguagesType>(translations: T, locales = navigator.languages): keyof T {
	return sortTranslations(translations, locales)[0]?.[0]
}
