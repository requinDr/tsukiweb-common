import { memo, RefObject, useLayoutEffect, useRef } from "react"

// The backdrop is rendered once on a small canvas
// (mirrored edges of the image, blurred)
const RESOLUTION = 96 // canvas pixels along the longest side
const BLUR = 3 // canvas pixels
const RATIO = 4 / 3

/** box blur (3 passes ≈ gaussian) */
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

function adjustColors(px: Uint8ClampedArray, saturation: number, brightness: number) {
	for (let i = 0; i < px.length; i += 4) {
		const r = px[i], g = px[i + 1], b = px[i + 2]
		const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
		px[i]     = (l + (r - l) * saturation) * brightness
		px[i + 1] = (l + (g - l) * saturation) * brightness
		px[i + 2] = (l + (b - l) * saturation) * brightness
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

	const ctx = canvas.getContext("2d")!
	ctx.clearRect(0, 0, W, H)
	ctx.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh)

	if (fx > 0) {
		const w = Math.min(fx, fw), s = w * sw / fw
		ctx.save()
		ctx.scale(-1, 1)
		ctx.drawImage(img, sx, sy, s, sh, -fx, fy, w, fh)
		ctx.drawImage(img, sx + sw - s, sy, s, sh, -(fx + fw + w), fy, w, fh)
		ctx.restore()
	}
	if (fy > 0) {
		const h = Math.min(fy, fh), s = h * sh / fh
		ctx.save()
		ctx.scale(1, -1)
		ctx.drawImage(img, sx, sy, sw, s, fx, -fy, fw, h)
		ctx.drawImage(img, sx, sy + sh - s, sw, s, fx, -(fy + fh + h), fw, h)
		ctx.restore()
	}

	// filter done by hand: Safari doesn't support `filter` on canvas contexts
	try {
		const data = ctx.getImageData(0, 0, W, H)
		blur(data.data, W, H, BLUR)
		blur(data.data, W, H, BLUR)
		blur(data.data, W, H, BLUR)
		adjustColors(data.data, 1.3, 0.7)
		ctx.putImageData(data, 0, 0)
	} catch {}

	const fade = (x0: number, y0: number, x1: number, y1: number) => {
		const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
		gradient.addColorStop(0, "rgb(0 0 0 / 0.1)")
		gradient.addColorStop(1, "rgb(0 0 0 / 0.85)")
		ctx.fillStyle = gradient
		ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1),
			Math.abs(x1 - x0) || W, Math.abs(y1 - y0) || H)
	}
	if (fx > 0) {
		fade(fx, 0, 0, 0)
		fade(fx + fw, 0, W, 0)
	}
	if (fy > 0) {
		fade(0, fy, 0, 0)
		fade(0, fy + fh, 0, H)
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
