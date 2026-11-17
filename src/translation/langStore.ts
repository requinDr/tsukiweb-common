import { createContext, createElement, type PropsWithChildren, useContext, useSyncExternalStore } from "react"
import { observe, unobserve } from "../utils/Observer"
import { ValueStorage } from "../utils/storage"
import { deepAssign, fetchJson, insertDirectory } from "../utils/utils"
import { LanguagesType, pickDefaultTranslation, TranslationId, UpdateDateFormat } from "./lang"

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
  const strings = deepAssign(deepAssign({}, defaultStrings), stringsStorage.get() ?? {} as Strings) as Strings
  strings.id = ""
  const selection = {ready: false}
  const ignoredPaths = new Set(optionalPaths)
  const StringsContext = createContext<string|null|undefined>(undefined)
  let targetId: TranslationId = ""

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

  function fallbackChain(id: TranslationId): TranslationId[] {
    const chain: TranslationId[] = []
    let current: TranslationId | undefined = id
    while (current) {
      if (!Object.hasOwn(languages, current) || chain.includes(current)) {
        console.warn(`translation "${chain.at(-1)}" has an invalid fallback "${current}"`)
        break
      }
      chain.push(current)
      current = languages[current].fallback
    }
    return chain
  }

  async function fetchTranslationFiles(id: TranslationId): Promise<Record<string, any>> {
    const {dir, "last-update": lastUpdate} = languages[id]
    const path = dir.startsWith("./") ? assetsPath + dir.substring(2) : dir
    const [lang, game] = await Promise.all(["lang", "game"].map(name =>
      fetchJson(`${path}/${name}.json?v=${appVersion}-${lastUpdate}`)
        .then(json => insertDirectory(json, dir))
    ))
    return deepAssign(lang, game)
  }

  async function loadTranslation(id: TranslationId): Promise<Strings> {
    let merged: Record<string, any> = {}
    let lastUpdate = ""
    for (const langId of fallbackChain(id)) {
      merged = deepAssign(await fetchTranslationFiles(langId), merged)
      if (languages[langId]["last-update"] > lastUpdate)
        lastUpdate = languages[langId]["last-update"]
      if (coversAllKeys(merged, defaultStrings))
        break
    }
    const result = deepAssign(deepAssign({}, defaultStrings), merged) as Strings
    result.id = id
    result.lastUpdate = lastUpdate as UpdateDateFormat
    return result
  }

  function defaultLanguage() {
    return pickDefaultTranslation(languages, [...navigator.languages, "en"]) as TranslationId
  }

  async function selectLanguage(requestedId: TranslationId) {
    const id = Object.hasOwn(languages, requestedId) ? requestedId : defaultLanguage()
    settings.language = id
    if (id === targetId)
      return
    targetId = id
    selection.ready = false
    try {
      const loaded = await loadTranslation(id)
      if (targetId !== id)
        return
      deepAssign(strings, loaded, {clean: true})
      stringsStorage.set(strings)
    } catch (error) {
      if (targetId !== id)
        return
      console.error(`unable to load translation "${id}"`, error)
      targetId = strings.id
      if (strings.id)
        settings.language = strings.id
    }
    selection.ready = true
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
    observe(selection, "ready", onStoreChange)
    return () => unobserve(selection, "ready", onStoreChange)
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
    try {
      const fetched = await fetchJson(`${assetsPath}languages.json?v=${appVersion}`, {cache: "no-cache"})
      for (const id of Object.keys(languages))
        delete languages[id]
      Object.assign(languages, fetched)
      languagesStorage.set(languages)
    } catch (error) {
      console.error("unable to fetch the list of translations", error)
    }
    if (Object.keys(languages).length === 0) {
      selection.ready = true
      return
    }
    observe(settings, "language", selectLanguage)
    await selectLanguage(settings.language)
  }

  initTranslations()

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
