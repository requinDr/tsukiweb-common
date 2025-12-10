const ASSETS_PATH = `${import.meta.env.BASE_URL}static/`

export function assetPath(basePath: string) {
	if (!/^\w+:\/\//.test(basePath)) // does not start with "<protocol>://"
		return ASSETS_PATH + basePath
	else
		return basePath
}

/**
 * Preload an image.
 * @param src full url of the image to preload
 */
export async function preloadImage(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = resolve as VoidFunction
		img.onerror = img.onabort = reject

		img.src = src
	})
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

export let imageFormat: string = import.meta.env.VITE_IMAGE_FORMAT ?? 'webp'

;(async () => {
	if (imageFormat === 'avif') {
		const supported = await avif.testSupport()
		if (!supported) {
			imageFormat = 'webp'
		}
	}
})()