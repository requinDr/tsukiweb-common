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

type Rgb = [r: number, g: number, b: number]

const DIM_FACTOR = 128 / 255
const luminosity = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b

let colorProbe: CanvasRenderingContext2D | undefined

function parseColor(css: string): Rgb {
	colorProbe ??= createCanvas(1, 1).getContext('2d', { willReadFrequently: true })!
	colorProbe.fillStyle = "#000"
	colorProbe.fillStyle = css
	colorProbe.fillRect(0, 0, 1, 1)
	const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data
	return [r, g, b]
}

/**
 * Look of the disabled scenes, applied in place on RGBA pixels: same as the
 * CSS filter `grayscale(1) brightness(0.5)`, then the hue and saturation of
 * `tint` (blend modes `saturation`, `multiply` and `color`).
 */
function dim(px: Uint8ClampedArray, tint?: Rgb) {
	let dr = 0, dg = 0, db = 0
	if (tint) {
		const [r, g, b] = tint
		const l = luminosity(r, g, b)
		dr = r - l; dg = g - l; db = b - l
	}
	const below = -Math.min(dr, dg, db), above = Math.max(dr, dg, db)
	for (let i = 0; i < px.length; i += 4) {
		const l = luminosity(px[i], px[i + 1], px[i + 2]) * DIM_FACTOR
		const k = Math.min(1, below > l ? l / below : 1, above > 255 - l ? (255 - l) / above : 1)
		px[i] = l + dr * k
		px[i + 1] = l + dg * k
		px[i + 2] = l + db * k
	}
}

/** Canvas with the pixels of `image` modified in place by `edit` */
function editPixels(image: ImageBitmap, edit: (px: Uint8ClampedArray) => void) {
	const { width, height } = image
	const canvas = createCanvas(width, height)
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!
	ctx.drawImage(image, 0, 0)
	const data = ctx.getImageData(0, 0, width, height)
	edit(data.data)
	ctx.putImageData(data, 0, 0)
	return canvas
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

const dimmedBlurredTile = (thumbnail: Thumbnail, tint = "") =>
	cached(`blur-dim:${thumbnail.file}:${thumbnail.source}:${tint}`, async () =>
		createImageBitmap(editPixels(await blurredTile(thumbnail).promise,
			px => dim(px, tint ? parseColor(tint) : undefined))))

/** Disabled version of a spritesheet, built again when the tint of a thumbnail changes */
type DimmedSheet = {
	tints: Map<string, string> // by source rectangle
	levels?: ImageBitmap[]
	stale: boolean
	building: boolean
}
const dimmedSheets = new Map<string, DimmedSheet>()

async function buildDimmedSheet(file: string, dimmed: DimmedSheet) {
	dimmed.building = true
	try {
		const [image] = await sheet(file).promise
		dimmed.stale = false
		const canvas = editPixels(image, px => {
			const original = px.slice()
			dim(px)
			for (const [source, tint] of dimmed.tints) {
				const [x, y, w, h] = source.split(',').map(Number)
				const rgb = parseColor(tint)
				for (let row = y; row < y + h; row++) {
					const start = (row * image.width + x) * 4, end = start + w * 4
					px.set(original.subarray(start, end), start)
					dim(px.subarray(start, end), rgb)
				}
			}
		})
		dimmed.levels = await createMipmap(canvas)
		listeners.forEach(listener => listener())
	} catch {
		dimmed.stale = true
	} finally {
		dimmed.building = false
	}
}

function dimmedSheet({ file, source }: Thumbnail, tint = "") {
	let dimmed = dimmedSheets.get(file)
	if (!dimmed)
		dimmedSheets.set(file, dimmed = { tints: new Map(), stale: true, building: false })
	const key = String(source)
	if (tint != (dimmed.tints.get(key) ?? "")) {
		dimmed.tints.set(key, tint)
		dimmed.stale = true
	}
	if (dimmed.stale && !dimmed.building)
		buildDimmedSheet(file, dimmed)
	return dimmed.levels
}

/** Calls `listener` each time a thumbnail is ready. Returns an unsubscribe function. */
export function onThumbnailReady(listener: VoidFunction) {
	listeners.add(listener)
	return () => { listeners.delete(listener) }
}

/**
 * Image to draw for a thumbnail, with the source rectangle in it, or null if
 * it is not ready yet (its preparation is then started).
 * @param level mipmap level, ignored for the blurred thumbnails
 * @param disabled set to get the thumbnail with the look of a disabled scene,
 *        colored with `tint` if any
 */
export function getThumbnail({ thumbnail, blur }: { thumbnail?: Thumbnail, blur?: boolean },
		level: number, disabled?: { tint?: string }): [CanvasImageSource, number, number, number, number] | null {
	if (!thumbnail)
		return null
	if (blur) {
		const bitmap = (disabled ? dimmedBlurredTile(thumbnail, disabled.tint) : blurredTile(thumbnail)).value
		return bitmap ? [bitmap, 0, 0, bitmap.width, bitmap.height] : null
	}
	const levels = disabled ? dimmedSheet(thumbnail, disabled.tint) : sheet(thumbnail.file).value
	const image = levels?.[level]
	if (!image)
		return null
	const [x, y, w, h] = thumbnail.source.map(v => v / (1 << level))
	return [image, x, y, w, h]
}
