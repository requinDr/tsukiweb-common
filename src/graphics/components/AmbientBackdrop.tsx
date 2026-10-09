import { memo, RefObject, useLayoutEffect, useRef } from "react"

// The backdrop is rendered once on a small canvas (mirrored edges of the image,
// blurred)
const RESOLUTION = 96 // canvas pixels along the longest side
const BLUR = 3 // canvas pixels
const RATIO = 4 / 3

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement) {
	const { clientWidth: cw, clientHeight: ch } = canvas
	if (!cw || !ch || !img.complete || !img.naturalWidth) return
	const scale = RESOLUTION / Math.max(cw, ch)
	const W = canvas.width = Math.max(1, Math.round(cw * scale))
	const H = canvas.height = Math.max(1, Math.round(ch * scale))

	// same geometry as the framed image (contain in the canvas, cover inside the frame)
	const fw = Math.min(W, H * RATIO), fh = Math.min(H, W / RATIO)
	const fx = (W - fw) / 2, fy = (H - fh) / 2
	const iw = img.naturalWidth, ih = img.naturalHeight
	const sw = Math.min(iw, ih * RATIO), sh = Math.min(ih, iw / RATIO)
	const sx = (iw - sw) / 2, sy = (ih - sh) / 2

	const tmp = document.createElement("canvas")
	tmp.width = W
	tmp.height = H
	const t = tmp.getContext("2d")!
	t.drawImage(img, sx, sy, sw, sh, fx, fy, fw, fh)

	// mirror the image on the sides, so the backdrop continues its edges
	if (fx > 0) {
		const w = Math.min(fx, fw), s = w * sw / fw
		t.save()
		t.scale(-1, 1)
		t.drawImage(img, sx, sy, s, sh, -fx, fy, w, fh)
		t.drawImage(img, sx + sw - s, sy, s, sh, -(fx + fw + w), fy, w, fh)
		t.restore()
	}
	if (fy > 0) {
		const h = Math.min(fy, fh), s = h * sh / fh
		t.save()
		t.scale(1, -1)
		t.drawImage(img, sx, sy, sw, s, fx, -fy, fw, h)
		t.drawImage(img, sx, sy + sh - s, sw, s, fx, -(fy + fh + h), fw, h)
		t.restore()
	}

	const ctx = canvas.getContext("2d")!
	ctx.clearRect(0, 0, W, H)
	ctx.filter = `blur(${BLUR}px) saturate(1.3) brightness(0.7)`
	ctx.drawImage(tmp, 0, 0)
	ctx.filter = "none"

	// fade to black away from the frame
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
