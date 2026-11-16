import { memo, RefObject, useLayoutEffect, useRef } from "react"

const RESOLUTION = 128 // canvas pixels along the longest side
const BLUR = 8 // canvas pixels
const BLUR_PASSES = 3
const RATIO = 4 / 3
const EDGE = 0.12 // portion of the image stretched over each band
const REACH = 0.7 // glow length, relative to the frame's shortest side
const SATURATION = 1.4
const GLOW = 0.55 // glow intensity next to the frame
const FADE_STEPS = 8

function blur(px: Uint8ClampedArray, W: number, H: number, r: number) {
	const src = px.slice()
	const pass = (n: number, m: number, stride: number, step: number) => {
		for (let j = 0; j < m; j++) {
			const base = j * stride
			for (let c = 0; c < 4; c++) {
				let sum = 0
				for (let k = -r; k <= r; k++)
					sum += src[base + Math.min(n - 1, Math.max(0, k)) * step + c]
				for (let i = 0; i < n; i++) {
					px[base + i * step + c] = sum / (2 * r + 1)
					sum += src[base + Math.min(n - 1, i + r + 1) * step + c]
						 - src[base + Math.max(0, i - r) * step + c]
				}
			}
		}
	}
	pass(W, H, W * 4, 4)
	src.set(px)
	pass(H, W, 4, W * 4)
}

function saturate(px: Uint8ClampedArray, saturation: number) {
	for (let i = 0; i < px.length; i += 4) {
		const r = px[i], g = px[i + 1], b = px[i + 2]
		const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
		px[i]     = l + (r - l) * saturation
		px[i + 1] = l + (g - l) * saturation
		px[i + 2] = l + (b - l) * saturation
	}
}

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement) {
	const { clientWidth: cw, clientHeight: ch } = canvas
	if (!cw || !ch || !img.complete || !img.naturalWidth) return
	const scale = RESOLUTION / Math.max(cw, ch)
	const W = canvas.width = Math.max(1, Math.round(cw * scale))
	const H = canvas.height = Math.max(1, Math.round(ch * scale))

	const fw = Math.min(W, H * RATIO), fh = Math.min(H, W / RATIO)
	const fx = (W - fw) / 2, fy = (H - fh) / 2
	const iw = img.naturalWidth, ih = img.naturalHeight
	const sw = Math.min(iw, ih * RATIO), sh = Math.min(ih, iw / RATIO)
	const sx = (iw - sw) / 2, sy = (ih - sh) / 2

	const ctx = canvas.getContext("2d", { willReadFrequently: true })!
	ctx.clearRect(0, 0, W, H)
	ctx.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh)

	if (fx > 0) {
		const s = Math.min(sw * EDGE, fx * sw / fw)
		ctx.save()
		ctx.scale(-1, 1)
		ctx.drawImage(img, sx, sy, s, sh, -fx, fy, fx, fh)
		ctx.drawImage(img, sx + sw - s, sy, s, sh, -W, fy, fx, fh)
		ctx.restore()
	}
	if (fy > 0) {
		const s = Math.min(sh * EDGE, fy * sh / fh)
		ctx.save()
		ctx.scale(1, -1)
		ctx.drawImage(img, sx, sy, sw, s, fx, -fy, fw, fy)
		ctx.drawImage(img, sx, sy + sh - s, sw, s, fx, -H, fw, fy)
		ctx.restore()
	}

	// filter done by hand: Safari doesn't support `filter` on canvas contexts
	try {
		const data = ctx.getImageData(0, 0, W, H)
		for (let i = 0; i < BLUR_PASSES; i++)
			blur(data.data, W, H, BLUR)
		saturate(data.data, SATURATION)
		ctx.putImageData(data, 0, 0)
	} catch {}

	const reach = Math.min(fw, fh) * REACH
	const fade = (x: number, y: number, dx: number, dy: number) => {
		const gradient = ctx.createLinearGradient(x, y, x + dx * reach, y + dy * reach)
		for (let i = 0; i <= FADE_STEPS; i++) {
			const t = i / FADE_STEPS
			gradient.addColorStop(t, `rgb(0 0 0 / ${1 - GLOW * (1 - t) ** 3})`)
		}
		ctx.fillStyle = gradient
		ctx.fillRect(dx < 0 ? 0 : x, dy < 0 ? 0 : y, dx ? fx : W, dy ? fy : H)
	}
	if (fx > 0) {
		fade(fx, 0, -1, 0)
		fade(fx + fw, 0, 1, 0)
	}
	if (fy > 0) {
		fade(0, fy, 0, -1)
		fade(0, fy + fh, 0, 1)
	}
}

type Props = {
	source: RefObject<HTMLImageElement | null>
	image: string
}

const AmbientBackdrop = ({ source, image }: Props) => {
	const ref = useRef<HTMLCanvasElement>(null)

	useLayoutEffect(() => {
		const canvas = ref.current, img = source.current
		if (!canvas || !img) return
		const redraw = () => draw(canvas, img)
		redraw()
		img.addEventListener("load", redraw)
		const observer = new ResizeObserver(redraw)
		observer.observe(canvas)
		return () => {
			img.removeEventListener("load", redraw)
			observer.disconnect()
		}
	}, [source, image])

	return <canvas ref={ref} className="ambient" aria-hidden />
}

export default memo(AmbientBackdrop)
