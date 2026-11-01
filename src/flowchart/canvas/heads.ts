import { headRect, POINT_RADIUS } from "../../assets/icons/badges"

const DETAILS_ZOOM = [2.2, 3.2]

/** `shape` cuts the head below its center, the head overflows it above */
export function headClip(shape: Path2D, r: number) {
	const clip = new Path2D()
	clip.addPath(shape)
	clip.rect(-2 * r, -4 * r, 4 * r, 4 * r)
	return clip
}

export function disc(r: number) {
	const path = new Path2D()
	path.arc(0, 0, r, 0, 2 * Math.PI)
	return path
}

export const POINT_HEAD_CLIP = headClip(disc(POINT_RADIUS - 0.3), POINT_RADIUS)

const images = new Map<string, HTMLImageElement>()

export function getHeadImage(src: string) {
	let image = images.get(src)
	if (!image) {
		image = new Image()
		image.src = src
		images.set(src, image)
	}
	return image
}

export function drawHead(ctx: CanvasRenderingContext2D, src: string, r: number, clip: Path2D,
		visibility: number) {
	const image = getHeadImage(src)
	if (visibility <= 0 || !image.complete || image.naturalWidth == 0)
		return
	const { x, y, size } = headRect(r)
	ctx.save()
	ctx.clip(clip)
	ctx.globalAlpha *= visibility
	ctx.drawImage(image, x, y, size, size)
	ctx.restore()
}

export function detailsVisibility(ctx: CanvasRenderingContext2D) {
	const { a, b } = ctx.getTransform()
	const pixelsPerUnit = Math.hypot(a, b) / devicePixelRatio
	const t = Math.min(1, Math.max(0, (pixelsPerUnit - DETAILS_ZOOM[0])
		/ (DETAILS_ZOOM[1] - DETAILS_ZOOM[0])))
	return t * t * (3 - 2 * t)
}
