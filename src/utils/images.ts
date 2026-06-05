import { ASSETS_PATH } from "../constants"

export function assetPath(basePath: string) {
	if (!/^\w+:\/\//.test(basePath)) // does not start with "<protocol>://"
		return ASSETS_PATH + basePath
	else
		return basePath
}

export function isImage(str: string) {
	const c = str.charAt(0)
	return c != '#' && c != '$'
}

/**
 * Preload an image.
 * @param src full url of the image to preload
 */
const preloadCache = new Map<string, Promise<void>>()
const loadedImage = Promise.resolve()

export function markImageLoaded(src: string) {
	if (!preloadCache.has(src))
		preloadCache.set(src, loadedImage)
}

export async function preloadImage(src: string): Promise<void> {
	const cached = preloadCache.get(src)
	if (cached)
		return cached

	const promise = new Promise<void>((resolve, reject) => {
		const img = new Image()
		img.onload = () => {
			markImageLoaded(src)
			resolve()
		}
		img.onerror = img.onabort = reject

		img.src = src
	})
	preloadCache.set(src, promise)
	promise.catch(() => preloadCache.delete(src))
	return promise
}


/**
 * AVIF support detector with caching.
 */
const avif = {
	isSupported: null as boolean | null,

	async testSupport(): Promise<boolean> {
		if (this.isSupported !== null) {
			return this.isSupported
		}

		this.isSupported = await new Promise<boolean>((resolve) => {
			const img = new Image()
			img.onload = () => resolve(true)
			img.onerror = () => resolve(false)

			// minimal AVIF header
			img.src =
				'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A='
		})

		return this.isSupported
	},
}

export let imageFormat: string = 'avif'

;(async () => {
	if (imageFormat === 'avif') {
		const supported = await avif.testSupport()
		if (!supported) {
			imageFormat = 'webp'
		}
	}
})()