export let supportAvif: boolean | null = null

export async function testAvifSupport(): Promise<boolean> {
	if (supportAvif !== null)
		return supportAvif

	return new Promise(resolve => {
		const img = new Image()
		img.onload = () => {
			supportAvif = true
			resolve(true)
		}
		img.onerror = () => {
			supportAvif = false
			resolve(false)
		}
		
		// base64 AVIF header
		img.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
	})
}
testAvifSupport()

export const replaceExtensionByAvif = (src: string): string => {
	if (src.endsWith(".webp"))
		return src.replace(".webp", ".avif")
	return src
}