import { SCENE_WIDTH } from "../constants"

export type Thumbnail = {
	file: string
	source: [x: number, y: number, w: number, h: number]
}

const MIP_LEVELS = 3 // full, 1/2 and 1/4 resolution spritesheets
const BLUR_STD_DEVIATION = 3

//##############################################################################
//#region                       IMAGE PROCESSING
//##############################################################################

export function createCanvas(width: number, height: number) {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

function boxBlurLine(src: Float32Array, dst: Float32Array, offset: number,
		stride: number, length: number, radius: number) {
	const size = radius * 2 + 1
	for (let channel = 0; channel < 4; channel++) {
		const at = (i: number) =>
			src[offset + Math.min(length - 1, Math.max(0, i)) * stride + channel]
		let sum = 0
		for (let i = -radius; i <= radius; i++)
			sum += at(i)
		for (let i = 0; i < length; i++) {
			dst[offset + i * stride + channel] = sum / size
			sum += at(i + radius + 1) - at(i - radius)
		}
	}
}

/**
 * Gaussian blur approximated by 3 box blurs. `ctx.filter` would be simpler,
 * but it is not supported on Safari.
 */
function blur(canvas: HTMLCanvasElement, sigma: number) {
	const { width, height } = canvas
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!
	const image = ctx.getImageData(0, 0, width, height)
	let a = Float32Array.from(image.data)
	let b = new Float32Array(a.length)
	// box size giving the same variance as the gaussian over 3 passes
	const radius = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2))
	for (let pass = 0; pass < 3; pass++) {
		for (let y = 0; y < height; y++)
			boxBlurLine(a, b, y * width * 4, 4, width, radius)
		;[a, b] = [b, a]
		for (let x = 0; x < width; x++)
			boxBlurLine(a, b, x * 4, width * 4, height, radius)
		;[a, b] = [b, a]
	}
	image.data.set(a)
	ctx.putImageData(image, 0, 0)
}

/**
 * Spritesheet at decreasing resolutions. Drawing from the level closest to
 * the displayed size keeps the thumbnails sharp on every browser: large
 * downscales in `drawImage` are blurry or aliased outside Chromium.
 */
async function createMipmap(source: HTMLImageElement | HTMLCanvasElement) {
	const levels = [await createImageBitmap(source)]
	let previous: CanvasImageSource = source
	let width = source.width, height = source.height
	for (let i = 1; i < MIP_LEVELS; i++) {
		width = Math.ceil(width / 2)
		height = Math.ceil(height / 2)
		const canvas = createCanvas(width, height)
		const ctx = canvas.getContext('2d')!
		// exact half size: each pixel averages 2x2 pixels of the previous level
		ctx.imageSmoothingQuality = 'high'
		ctx.drawImage(previous, 0, 0, width, height)
		levels.push(await createImageBitmap(canvas))
		previous = canvas
	}
	return levels
}

//#endregion ###################################################################
//#region                           CACHE
//##############################################################################

type Bitmaps = ImageBitmap | ImageBitmap[]

/**
 * Bitmaps shared by all the flowcharts of the session, prepared once: opening
 * a flowchart again shows its thumbnails immediately. They are kept as
 * ImageBitmaps, which are drawn without texture upload.
 */
const cache = new Map<string, { promise: Promise<Bitmaps>, value?: Bitmaps }>()
const listeners = new Set<VoidFunction>()

function cached<T extends Bitmaps>(key: string, create: () => Promise<T>) {
	let entry = cache.get(key)
	if (!entry) {
		const promise = create()
		const newEntry: { promise: Promise<Bitmaps>, value?: Bitmaps } = { promise }
		cache.set(key, entry = newEntry)
		promise.then(value => {
			newEntry.value = value
			listeners.forEach(listener => listener())
		}, () => cache.delete(key))
	}
	return entry as { promise: Promise<T>, value?: T }
}

const sheet = (file: string) => cached(`sheet:${file}`, async () => {
	const image = new Image()
	image.src = file
	await image.decode()
	return createMipmap(image)
})

const blurredTile = ({ file, source }: Thumbnail) =>
	cached(`blur:${file}:${source}`, async () => {
		const [image] = await sheet(file).promise
		const [x, y, w, h] = source
		const canvas = createCanvas(w, h)
		canvas.getContext('2d', { willReadFrequently: true })!
			.drawImage(image, x, y, w, h, 0, 0, w, h)
		blur(canvas, BLUR_STD_DEVIATION * w / SCENE_WIDTH)
		return createImageBitmap(canvas)
	})

/** Calls `listener` each time a thumbnail is ready. Returns an unsubscribe function. */
export function onThumbnailReady(listener: VoidFunction) {
	listeners.add(listener)
	return () => { listeners.delete(listener) }
}

/**
 * Image to draw for a thumbnail, with the source rectangle in it, or null if
 * it is not ready yet (its preparation is then started).
 * @param level mipmap level, ignored for the blurred thumbnails
 */
export function getThumbnail({ thumbnail, blur }: { thumbnail?: Thumbnail, blur?: boolean },
		level: number): [CanvasImageSource, number, number, number, number] | null {
	if (!thumbnail)
		return null
	if (blur) {
		const bitmap = blurredTile(thumbnail).value
		return bitmap ? [bitmap, 0, 0, bitmap.width, bitmap.height] : null
	}
	const image = sheet(thumbnail.file).value?.[level]
	if (!image)
		return null
	const [x, y, w, h] = thumbnail.source.map(v => v / (1 << level))
	return [image, x, y, w, h]
}
