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