import { createContext, createElement, type PropsWithChildren, useContext, useSyncExternalStore } from "react"
import { observe, unobserve } from "../utils/Observer"
import { ValueStorage } from "../utils/storage"
import { deepAssign, fetchJson, insertDirectory } from "../utils/utils"
import { LangDesc, LanguagesType, pickDefaultTranslation, TranslationId, UpdateDateFormat } from "./lang"

export type TranslationStrings<T> = T & {
  id: TranslationId
  lastUpdate?: UpdateDateFormat
}

type TranslationStoreOptions = {
  appVersion: string
  assetsPath: string
  optionalPaths?: Iterable<string>
  storagePrefix?: string
}

export function createTranslationStore<T extends Record<string, any>>(
  defaultStrings: T,
  settings: {language: string},
  {appVersion, assetsPath, optionalPaths = [], storagePrefix = ""}: TranslationStoreOptions
) {
  type Strings = TranslationStrings<T>

  const languagesStorage = new ValueStorage<LanguagesType>(`${storagePrefix}languages`, false, JSON.stringify, JSON.parse)
  const stringsStorage = new ValueStorage<Strings>(`${storagePrefix}strings`, true, JSON.stringify, JSON.parse)
  const languages = languagesStorage.get() || {} as LanguagesType
  const strings = stringsStorage.get() || deepAssign({}, defaultStrings) as Strings
  strings.id = ""
  const selection = {ready: false}
  const ignoredPaths = new Set(optionalPaths)
  const StringsContext = createContext<string|null|undefined>(undefined)

  function coversAllKeys(source: object, reference: object, path = ""): boolean {
    for (const [key, refVal] of Object.entries(reference)) {
      const fullPath = path ? `${path}.${key}` : key
      if (ignoredPaths.has(fullPath)) continue
      if (!Object.hasOwn(source, key)) {
        console.debug(`missing key: ${fullPath}`)
        return false
      }
      if (refVal !== null && typeof refVal === "object" && !Array.isArray(refVal)) {
        const srcVal = (source as Record<string, unknown>)[key]
        if (typeof srcVal !== "object" || !coversAllKeys(srcVal as object, refVal, fullPath))
          return false
      }
    }
    return true
  }

  async function loadTranslation(requestedId: TranslationId): Promise<Strings> {
    const id = Object.hasOwn(languages, requestedId)
      ? requestedId
      : Object.getOwnPropertyNames(languages)[0]
    const {dir, fallback, "last-update": lastUpdate} = languages[id]
    const path = dir.startsWith("./") ? assetsPath + dir.substring(2) : dir
    const [lang, game] = await Promise.all([
      fetchJson(`${path}/lang.json?v=${appVersion}`).then(json => insertDirectory(json, dir)),
      fetchJson(`${path}/game.json?v=${appVersion}`).then(json => insertDirectory(json, dir)),
    ])
    const merged = deepAssign(deepAssign({}, lang), game)
    const result = fallback && !coversAllKeys(merged, defaultStrings)
      ? await loadTranslation(fallback)
      : deepAssign({}, defaultStrings) as Strings

    result.id = id
    if (!result.lastUpdate || lastUpdate > result.lastUpdate)
      result.lastUpdate = lastUpdate
    deepAssign(result, lang)
    deepAssign(result, game)
    return result
  }

  async function updateLanguage(id: TranslationId, forceUpdate = false) {
    if (!forceUpdate && strings.id === id)
      return
    selection.ready = false
    deepAssign(strings, await loadTranslation(id), {clean: true})
    stringsStorage.set(strings)
    selection.ready = true
  }

  function setDefaultLanguage() {
    if (settings.language === "default")
      settings.language = pickDefaultTranslation(languages, [...navigator.languages, "en"]) as string
  }

  async function fetchAvailableLanguages() {
    deepAssign(languages, await fetchJson(`${assetsPath}languages.json?v=${appVersion}`))
    languagesStorage.set(languages)
    setDefaultLanguage()
    let id: TranslationId | undefined = settings.language
    let lastUpdate = ""
    while (id) {
      const desc: LangDesc = languages[id]
      lastUpdate = desc["last-update"] > lastUpdate ? desc["last-update"] : lastUpdate
      id = desc.fallback
    }
    if (strings.id !== settings.language || !strings.lastUpdate || lastUpdate > strings.lastUpdate)
      updateLanguage(settings.language, true)
  }

  function isLanguageLoaded() {
    return selection.ready
  }

  async function waitLanguageLoad() {
    if (isLanguageLoaded()) return
    return new Promise(resolve => {
      observe(selection, "ready", resolve, {once: true})
    })
  }

  function subscribeStrings(onStoreChange: VoidFunction) {
    observe(strings, "id", onStoreChange)
    observe(selection, "ready", onStoreChange)
    return () => {
      unobserve(strings, "id", onStoreChange)
      unobserve(selection, "ready", onStoreChange)
    }
  }

  function StringsProvider({children}: PropsWithChildren) {
    const version = useSyncExternalStore(
      subscribeStrings,
      () => selection.ready ? strings.id : null
    )
    return createElement(StringsContext.Provider, {value: version}, children)
  }

  function useStrings() {
    if (useContext(StringsContext) === undefined)
      throw new Error("useStrings must be used within StringsProvider")
    return strings
  }

  function getLocale() {
    return languages[settings.language]?.locale ?? "en-US"
  }

  async function initTranslations() {
    if (!languagesStorage.storageExists())
      await fetchAvailableLanguages()
    else
      fetchAvailableLanguages()

    if (!strings.id || strings.id !== settings.language)
      await updateLanguage(settings.language)
    else
      selection.ready = true
  }

  observe(settings, "language", lang => updateLanguage(lang))
  window.addEventListener("load", initTranslations)

  return {
    languages,
    strings,
    StringsProvider,
    useStrings,
    getLocale,
    isLanguageLoaded,
    waitLanguageLoad,
  }
}
