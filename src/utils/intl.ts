/**
 * Returns a getter that creates the formatter once per locale and reuses it.
 */
export function cachedFormat<T>(create: (locale: string) => T) {
	const cache = new Map<string, T>()
	return (locale: string) => {
		let format = cache.get(locale)
		if (!format)
			cache.set(locale, format = create(locale))
		return format
	}
}
