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
  'authors'?: string
}

export type LanguagesType = Record<TranslationId, LangDesc>

const EMOJI_REGEX = /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])+|^(\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF])/
/** Compare language descriptors by dislpay name */
const langCompare = (lang1: [string, LangDesc], lang2: [string, LangDesc]) => {
	let name1 = lang1[1]["display-name"]
	let name2 = lang2[1]["display-name"]

	// Remove leading emojis
	name1 = name1.replace(EMOJI_REGEX, '').trim()
	name2 = name2.replace(EMOJI_REGEX, '').trim()
	
	return name1.localeCompare(name2)
}

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
  for (let locale of locales) {
    let i = entries.findIndex(([_, lang])=> lang.locale == locale)
    if (i == -1) {
      // if country-specific locale not found, search for language
      // without country
      locale = locale.split('-')[0]+'-'
      i = entries.findIndex(([_, lang])=> lang.locale.startsWith(locale))
    }
    if (i != -1) {
      sorted.push(entries[i])
      entries.splice(i, 1)
    }
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
  return sortTranslations(translations, locales)[0][0]
}
