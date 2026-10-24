import { SCENE_HEIGHT, SCENE_WIDTH } from "../constants"
import { Camera, Rect } from "./camera"
import { FcLinks } from "./links"
import { createCanvas, getThumbnail, onThumbnailReady, Thumbnail } from "./thumbnails"

//##############################################################################
//#region                           TYPES
//##############################################################################

export type FcCanvasNode = Rect & { id: string }

export type FcCanvasItem<N extends FcCanvasNode = FcCanvasNode> = {
	node: N
	/** 'hidden': not seen, 'image': thumbnail, 'box': no thumbnail */
	kind: 'hidden' | 'image' | 'box'
	thumbnail?: Thumbnail
	blur?: boolean
	disabled?: boolean
	group?: string
	popover?: boolean
	nav?: { x: number, y: number }
}

/** Reads computed CSS values in the flowchart, e.g. to resolve variables */
export type StyleReader = {
	color: (css: string) => string
	property: (name: string) => string
}

/** Draws game-specific elements (e.g. badges) over the scenes */
export type FcOverlayDrawer =
	(ctx: CanvasRenderingContext2D, view: Rect, style: StyleReader) => void

type FcCanvasContent = {
	items: FcCanvasItem<any>[]
	links: FcLinks
	overlay?: FcOverlayDrawer
}

/** `glow` and `tint` come from the CSS variables `--fc-link-glow` and `--fc-scene-tint` */
type Stroke = { color: string, width: number, glow?: string, tint?: string }
type Styles = ReturnType<typeof createStyleReader>

const IMAGE_RADIUS = SCENE_HEIGHT / 14
const HIDDEN_RADIUS = SCENE_HEIGHT / 10
const FRAME_RADIUS = 1.6
const HIGHLIGHT_WIDTH = 1.5 // frame of the hovered or focused scene
const LINK_GLOW_LAYERS = [
	{ width: 2.3, alpha: 0.15 },
	{ width: 1.5, alpha: 0.3 },
]

//#endregion ###################################################################
//#region                           HELPERS
//##############################################################################

const pathCache = new Map<string, Path2D>()
/** Path2D of an SVG path data, created once */
export function path2D(d: string) {
	let p = pathCache.get(d)
	if (!p)
		pathCache.set(d, p = new Path2D(d))
	return p
}

function intersects(a: Rect, b: Rect) {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** Adds the 4 corners outside the rounded rectangle `rect` to `p` */
function addCorners(p: Path2D, { left: l, top: t, right: r, bottom: b }: Rect, radius: number) {
	const PI = Math.PI
	p.moveTo(l, t); p.lineTo(l + radius, t)
	p.arc(l + radius, t + radius, radius, -PI / 2, PI, true); p.closePath()
	p.moveTo(r, t); p.lineTo(r, t + radius)
	p.arc(r - radius, t + radius, radius, 0, -PI / 2, true); p.closePath()
	p.moveTo(r, b); p.lineTo(r - radius, b)
	p.arc(r - radius, b - radius, radius, PI / 2, 0, true); p.closePath()
	p.moveTo(l, b); p.lineTo(l, b - radius)
	p.arc(l + radius, b - radius, radius, PI, PI / 2, true); p.closePath()
}

function roundRect(ctx: CanvasRenderingContext2D, rect: Rect, radius: number) {
	ctx.beginPath()
	ctx.roundRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top, radius)
}

/** Background of the scenes not seen */
function createHiddenTile() {
	const canvas = createCanvas(SCENE_WIDTH * 4, SCENE_HEIGHT * 4)
	const ctx = canvas.getContext('2d')!
	ctx.scale(canvas.width, canvas.height)
	const gradient = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5)
	gradient.addColorStop(0, "#222")
	gradient.addColorStop(0.6, "#111")
	gradient.addColorStop(0.95, "black")
	ctx.fillStyle = gradient
	ctx.fillRect(0, 0, 1, 1)
	return canvas
}

/**
 * The colors and widths come from the game stylesheet: they are read on a
 * hidden SVG element with the classes `fc-link enabled group-x`,
 * `fc-scene unlocked disabled`, etc. Each value is read once.
 */
function createStyleReader(root: HTMLElement) {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
	svg.style.cssText = "position:absolute;width:0;height:0;visibility:hidden"
	const probe = document.createElementNS("http://www.w3.org/2000/svg", "path")
	svg.append(probe)
	root.append(svg)
	const cache = new Map<string, Stroke>()
	const read = (key: string, className: string, stroke: string) => {
		let value = cache.get(key)
		if (!value) {
			probe.setAttribute("class", className)
			probe.style.stroke = stroke
			const style = getComputedStyle(probe)
			cache.set(key, value = {
				color: style.stroke,
				width: Number.parseFloat(style.strokeWidth) || 0.6,
				glow: style.getPropertyValue('--fc-link-glow').trim(),
				tint: style.getPropertyValue('--fc-scene-tint').trim(),
			})
		}
		return value
	}
	return {
		/** stroke of an element with the class(es) `className` */
		stroke: (className: string) => read(`.${className}`, className, ""),
		color: (css: string) => read(css, "", css).color,
		property: (name: string) => getComputedStyle(root).getPropertyValue(name),
		dispose: () => svg.remove(),
	}
}

const groupClass = (group?: string) => group ? ` group-${group}` : ''
const sceneClass = ({ disabled, group }: FcCanvasItem) =>
	`fc-scene unlocked${disabled ? ' disabled' : ''}${groupClass(group)}`

//#endregion ###################################################################
//#region                          RENDERER
//##############################################################################

export class FlowchartRenderer {
	private canvas: HTMLCanvasElement
	private ctx: CanvasRenderingContext2D
	private camera: Camera
	private styleRoot: HTMLElement
	private dprX = 1
	private dprY = 1
	private frame = 0
	private disposed = false
	private content: FcCanvasContent | null = null
	private styles: Styles | null = null
	private hiddenTile = createHiddenTile()
	private unsubscribe = onThumbnailReady(() => this.requestDraw())
	hovered: string | null = null
	focused: string | null = null

	/**
	 * @param styleRoot element inside the game flowchart container, used to
	 *        read the colors from the game stylesheet
	 */
	constructor(canvas: HTMLCanvasElement, camera: Camera, styleRoot: HTMLElement) {
		this.canvas = canvas
		this.ctx = canvas.getContext('2d')!
		this.camera = camera
		this.styleRoot = styleRoot
	}

	setContent(content: FcCanvasContent) {
		this.content = content
		content.items.forEach(item => getThumbnail(item, 0)) // start the preparation
		this.styles?.dispose()
		this.styles = null
		this.requestDraw()
	}

	/**
	 * @param width,height size of the canvas in CSS px
	 * @param pixelWidth,pixelHeight size of the canvas in device px. Must
	 *        match exactly what is displayed, or the browser resamples the
	 *        whole canvas and blurs it.
	 */
	resize(width: number, height: number, pixelWidth: number, pixelHeight: number) {
		this.dprX = pixelWidth / width
		this.dprY = pixelHeight / height
		this.canvas.width = pixelWidth
		this.canvas.height = pixelHeight
		this.draw()
	}

	requestDraw() {
		if (!this.frame && !this.disposed)
			this.frame = requestAnimationFrame(() => {
				this.frame = 0
				this.draw()
			})
	}

	dispose() {
		this.disposed = true
		cancelAnimationFrame(this.frame)
		this.unsubscribe()
		this.styles?.dispose()
	}

	private draw() {
		const { ctx, canvas, camera, dprX, dprY, content } = this
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		if (!content)
			return
		const styles = this.styles ??= createStyleReader(this.styleRoot)
		ctx.setTransform(camera.scale * dprX, 0, 0, camera.scale * dprY,
			camera.tx * dprX, camera.ty * dprY)
		ctx.lineJoin = 'round'
		ctx.lineCap = 'butt'
		// the mipmap level is at most 2x bigger than the displayed size:
		// bilinear filtering is enough, and much cheaper on mobile GPUs
		ctx.imageSmoothingQuality = 'medium'

		this.drawLinks(content.links, styles)

		const view = camera.visibleRect(SCENE_WIDTH)
		// all thumbnails have the same size: pick the mipmap level once
		const tileWidth = content.items.find(item => item.thumbnail)?.thumbnail!.source[2] ?? 1
		const ratio = tileWidth / (SCENE_WIDTH * camera.scale * dprX)
		const level = Math.max(0, Math.min(2, Math.floor(Math.log2(ratio))))
		const visible = content.items.filter(item => intersects(item.node, view))
		for (const item of visible)
			this.drawSceneContent(item, styles, level)

		// Disabled scenes: same as the CSS filter `grayscale(1) brightness(0.5)`,
		// applied on all of them at once (`ctx.filter` is not supported on Safari)
		const disabled = new Path2D()
		for (const { node, disabled: isDisabled } of visible)
			if (isDisabled)
				disabled.rect(node.left, node.top, node.right - node.left, node.bottom - node.top)
		ctx.fillStyle = "rgb(128 128 128)"
		ctx.globalCompositeOperation = 'saturation'
		ctx.fill(disabled)
		ctx.globalCompositeOperation = 'multiply'
		ctx.fill(disabled)
		ctx.globalCompositeOperation = 'color'
		for (const item of visible) {
			const tint = item.disabled && styles.stroke(sceneClass(item)).tint
			if (tint) {
				const { left, top, right, bottom } = item.node
				ctx.fillStyle = tint
				ctx.fillRect(left, top, right - left, bottom - top)
			}
		}

		// Round the corners of all the scenes at once. Clipping each scene
		// instead is expensive on mobile.
		const corners = new Path2D()
		for (const item of visible)
			addCorners(corners, item.node, item.kind == 'hidden' ? HIDDEN_RADIUS : IMAGE_RADIUS)
		ctx.globalCompositeOperation = 'destination-out'
		ctx.fill(corners)
		ctx.globalCompositeOperation = 'source-over'

		for (const item of visible)
			this.drawFrame(item, styles)

		content.overlay?.(ctx, view, styles)
	}

	private stroke(target: Path2D | null, { color, width }: Stroke, dash: number[] = []) {
		const ctx = this.ctx
		ctx.strokeStyle = color
		ctx.lineWidth = width
		ctx.setLineDash(dash)
		if (target)
			ctx.stroke(target)
		else
			ctx.stroke()
	}

	private drawLinks(links: FcLinks, styles: Styles) {
		const disabled = styles.stroke("fc-link disabled")
		const enabled = (group?: string) => styles.stroke(`fc-link enabled${groupClass(group)}`)
		for (const { width, alpha } of LINK_GLOW_LAYERS) {
			this.ctx.globalAlpha = alpha
			const glow = (group?: string) => ({ color: enabled(group).glow!, width })
			links.enabled.forEach(([group, d]) => enabled(group).glow && this.stroke(path2D(d), glow(group)))
			links.enabledDashed.forEach(({ d, dash, group }) =>
				enabled(group).glow && this.stroke(path2D(d), glow(group), dash))
		}
		this.ctx.globalAlpha = 1
		links.disabledDashed.forEach(({ d, dash }) => this.stroke(path2D(d), disabled, dash))
		if (links.disabled)
			this.stroke(path2D(links.disabled), disabled)
		links.enabled.forEach(([group, d]) => this.stroke(path2D(d), enabled(group)))
		links.enabledDashed.forEach(({ d, dash, group }) =>
			this.stroke(path2D(d), enabled(group), dash))
		this.ctx.setLineDash([])
	}

	/** Thumbnail, or placeholder for hidden and loading scenes */
	private drawSceneContent(item: FcCanvasItem, styles: Styles, level: number) {
		const { ctx } = this
		const { left, top, right, bottom } = item.node
		const width = right - left, height = bottom - top

		if (item.kind == 'hidden') {
			ctx.drawImage(this.hiddenTile, left, top, width, height)
			ctx.beginPath()
			ctx.moveTo(left, top)
			ctx.lineTo(right, bottom)
			ctx.moveTo(left, bottom)
			ctx.lineTo(right, top)
			this.stroke(null, { color: "black", width: 0.4 })
			return
		}
		const image = getThumbnail(item, level)
		if (image) {
			const [source, sx, sy, sw, sh] = image
			ctx.drawImage(source, sx, sy, sw, sh, left, top, width, height)
		} else { // no thumbnail, or not loaded yet
			ctx.fillStyle = item.kind == 'box'
				? styles.color("var(--active-connection)")
				: styles.stroke(sceneClass({ ...item, disabled: true })).color
			ctx.fillRect(left, top, width, height)
		}
	}

	private drawFrame(item: FcCanvasItem, styles: Styles) {
		if (item.kind == 'hidden') {
			roundRect(this.ctx, item.node, HIDDEN_RADIUS)
			this.stroke(null, styles.stroke("fc-scene"))
			return
		}
		const frame = styles.stroke(sceneClass(item))
		const id = item.node.id
		const highlighted = !item.disabled && (id == this.hovered || id == this.focused)
		roundRect(this.ctx, item.node, FRAME_RADIUS)
		this.stroke(null, highlighted ? { ...frame, width: HIGHLIGHT_WIDTH } : frame)
	}
}
