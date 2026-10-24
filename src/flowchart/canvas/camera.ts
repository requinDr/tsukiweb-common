//##############################################################################
//#region                           CAMERA
//##############################################################################

export type Rect = { left: number, top: number, right: number, bottom: number }

const ANIMATION_DURATION = 250
const MIN_VISIBLE = 0.5 // fraction of the viewport covered by the flowchart

/**
 * 2D camera mapping world coordinates to viewport (CSS px) coordinates:
 * `screen = world * scale + translation`.
 */
export class Camera {
	scale = 1
	tx = 0
	ty = 0
	viewportWidth = 0
	viewportHeight = 0
	minScale = 0
	maxScale = Infinity
	bounds: Rect = { left: 0, top: 0, right: 0, bottom: 0 }
	onChange: VoidFunction = () => {}
	private animFrame = 0

	setViewport(width: number, height: number) {
		this.viewportWidth = width
		this.viewportHeight = height
		this.apply(this.scale, this.tx, this.ty)
	}

	/** Set the camera state, clamped to the scale limits and content bounds */
	apply(scale: number, tx: number, ty: number) {
		const { left, top, right, bottom } = this.bounds
		scale = Math.min(this.maxScale, Math.max(this.minScale, scale))
		const marginX = this.viewportWidth * (1 - MIN_VISIBLE)
		const marginY = this.viewportHeight * (1 - MIN_VISIBLE)
		tx = Math.min(marginX - left * scale,
			Math.max(this.viewportWidth - marginX - right * scale, tx))
		ty = Math.min(marginY - top * scale,
			Math.max(this.viewportHeight - marginY - bottom * scale, ty))
		if (scale == this.scale && tx == this.tx && ty == this.ty)
			return
		this.scale = scale
		this.tx = tx
		this.ty = ty
		this.onChange()
	}

	panBy(dx: number, dy: number) {
		this.apply(this.scale, this.tx + dx, this.ty + dy)
	}

	zoomAt(factor: number, x: number, y: number) {
		const scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor))
		const ratio = scale / this.scale
		this.apply(scale, x - (x - this.tx) * ratio, y - (y - this.ty) * ratio)
	}

	visibleRect(margin = 0): Rect {
		const { scale, tx, ty } = this
		return {
			left: -tx / scale - margin,
			top: -ty / scale - margin,
			right: (this.viewportWidth - tx) / scale + margin,
			bottom: (this.viewportHeight - ty) / scale + margin,
		}
	}

	ensureVisible(rect: Rect, margin: number) {
		const { scale, tx, ty } = this
		const left = rect.left * scale + tx - margin
		const right = rect.right * scale + tx + margin
		const top = rect.top * scale + ty - margin
		const bottom = rect.bottom * scale + ty + margin
		const dx = left < 0 ? -left
			: right > this.viewportWidth ? this.viewportWidth - right : 0
		const dy = top < 0 ? -top
			: bottom > this.viewportHeight ? this.viewportHeight - bottom : 0
		if (dx != 0 || dy != 0)
			this.moveTo(scale, tx + dx, ty + dy, true)
	}

	moveTo(scale: number, tx: number, ty: number, animate = false) {
		this.stopAnimation()
		if (!animate)
			return this.apply(scale, tx, ty)
		const from = { scale: this.scale, tx: this.tx, ty: this.ty }
		const start = performance.now()
		const step = (time: number) => {
			const t = Math.min(1, (time - start) / ANIMATION_DURATION)
			const k = 1 - Math.pow(1 - t, 3) // ease-out cubic
			this.apply(
				from.scale + (scale - from.scale) * k,
				from.tx + (tx - from.tx) * k,
				from.ty + (ty - from.ty) * k)
			this.animFrame = t < 1 ? requestAnimationFrame(step) : 0
		}
		this.animFrame = requestAnimationFrame(step)
	}

	stopAnimation() {
		cancelAnimationFrame(this.animFrame)
		this.animFrame = 0
	}
}


//#endregion ###################################################################
//#region                          CONTROLS
//##############################################################################

const DRAG_THRESHOLD = 6
const DECELERATION = { touch: 0.998, mouse: 0.995 }
const INERTIA_STOP_SPEED = 0.02
const VELOCITY_WINDOW = 80 // ms
const WHEEL_SMOOTHING = 60 // ms, time constant of the mouse wheel animation
const WHEEL_NOTCH_THRESHOLD = 40 // px, smaller deltas come from trackpads
const WHEEL_NOTCH_ZOOM = Math.log(1.25) // zoom per mouse wheel notch
const PINCH_ZOOM_SPEED = 0.01 // zoom per trackpad pinch delta unit

type GestureEvent = UIEvent & { scale: number, clientX: number, clientY: number }

/**
 * Bind mouse, touch, pen, wheel and trackpad gestures on `element` to the
 * camera. All gestures only update the camera; the page never scrolls nor
 * zooms natively. Returns a cleanup function.
 */
export function attachCameraControls(camera: Camera, element: HTMLElement,
		onGestureStart?: VoidFunction) {
	const pointers = new Map<number, { x: number, y: number }>()
	let moved = false
	let suppressClick = false
	let dragStart = { x: 0, y: 0 }
	let deceleration = DECELERATION.touch
	let samples: { x: number, y: number, t: number }[] = []
	let inertiaFrame = 0
	let gestureScale = 1

	const local = (x: number, y: number): [number, number] => {
		const rect = element.getBoundingClientRect()
		return [x - rect.left, y - rect.top]
	}

	const stopInertia = () => {
		cancelAnimationFrame(inertiaFrame)
		inertiaFrame = 0
	}

	const startInertia = () => {
		const now = performance.now()
		samples = samples.filter(s => now - s.t <= VELOCITY_WINDOW)
		if (samples.length < 2)
			return
		const first = samples[0], last = samples[samples.length - 1]
		const elapsed = Math.max(last.t - first.t, 1)
		let vx = (last.x - first.x) / elapsed
		let vy = (last.y - first.y) / elapsed
		let previousTime = now
		const glide = (time: number) => {
			const dt = Math.min(time - previousTime, 32)
			previousTime = time
			const friction = Math.pow(deceleration, dt)
			vx *= friction
			vy *= friction
			if (Math.hypot(vx, vy) < INERTIA_STOP_SPEED)
				return
			const { tx, ty } = camera
			camera.panBy(vx * dt, vy * dt)
			// stop gliding along an axis blocked by the edges of the flowchart
			if (camera.tx == tx) vx = 0
			if (camera.ty == ty) vy = 0
			inertiaFrame = requestAnimationFrame(glide)
		}
		inertiaFrame = requestAnimationFrame(glide)
	}

	const centroid = () => {
		let x = 0, y = 0
		for (const p of pointers.values()) { x += p.x; y += p.y }
		return { x: x / pointers.size, y: y / pointers.size }
	}

	const distance = () => {
		const [a, b] = pointers.values()
		return Math.hypot(a.x - b.x, a.y - b.y)
	}

	const onPointerDown = (event: PointerEvent) => {
		if (event.pointerType == 'mouse' && event.button != 0)
			return
		camera.stopAnimation()
		stopInertia()
		stopWheel()
		if (pointers.size == 0) {
			moved = false
			samples = []
			dragStart = { x: event.clientX, y: event.clientY }
			deceleration = event.pointerType == 'mouse' ? DECELERATION.mouse : DECELERATION.touch
		}
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
	}

	const onPointerMove = (event: PointerEvent) => {
		const pointer = pointers.get(event.pointerId)
		if (!pointer)
			return
		const before = centroid()
		const beforeDistance = pointers.size >= 2 ? distance() : 0
		pointer.x = event.clientX
		pointer.y = event.clientY
		const after = centroid()

		if (!moved) {
			if (pointers.size < 2 && Math.hypot(after.x - dragStart.x, after.y - dragStart.y) < DRAG_THRESHOLD)
				return
			moved = true
			onGestureStart?.()
			try {
				element.setPointerCapture(event.pointerId)
			} catch {}
		}
		if (pointers.size >= 2) {
			const [x, y] = local(after.x, after.y)
			camera.zoomAt(distance() / Math.max(beforeDistance, 1), x, y)
		}
		camera.panBy(after.x - before.x, after.y - before.y)
		samples.push({ ...after, t: performance.now() })
		if (samples.length > 20)
			samples.shift()
	}

	const onPointerUp = (event: PointerEvent) => {
		if (!pointers.delete(event.pointerId))
			return
		if (pointers.size > 0) {
			samples = []
		} else if (moved) {
			suppressClick = true
			setTimeout(() => { suppressClick = false }, 0)
			if (event.type == 'pointerup')
				startInertia()
		}
	}

	const onClick = (event: MouseEvent) => {
		if (!suppressClick)
			return
		event.preventDefault()
		event.stopPropagation()
		suppressClick = false
	}

	// Wheel deltas are accumulated and applied once per frame. Mouse wheel
	// notches (large deltas) are spread over a few frames like a native
	// smooth scroll; trackpad deltas (small and frequent) are applied as-is.
	const wheel = { dx: 0, dy: 0, zoom: 0, x: 0, y: 0, smooth: false, frame: 0, time: 0 }

	const stopWheel = () => {
		cancelAnimationFrame(wheel.frame)
		wheel.frame = 0
		wheel.dx = wheel.dy = wheel.zoom = 0
	}

	const stepWheel = (time: number) => {
		const dt = Math.min(time - wheel.time, 50)
		wheel.time = time
		let k = wheel.smooth ? 1 - Math.exp(-dt / WHEEL_SMOOTHING) : 1
		// apply everything that remains if it is too small to be noticed
		if (Math.abs(wheel.dx * (1 - k)) < 0.5 && Math.abs(wheel.dy * (1 - k)) < 0.5
				&& Math.abs(wheel.zoom * (1 - k)) < 1e-3)
			k = 1
		if (wheel.zoom != 0)
			camera.zoomAt(Math.exp(wheel.zoom * k), wheel.x, wheel.y)
		camera.panBy(-wheel.dx * k, -wheel.dy * k)
		if (k == 1)
			stopWheel()
		else {
			wheel.dx -= wheel.dx * k
			wheel.dy -= wheel.dy * k
			wheel.zoom -= wheel.zoom * k
			wheel.frame = requestAnimationFrame(stepWheel)
		}
	}

	const onWheel = (event: WheelEvent) => {
		event.preventDefault()
		camera.stopAnimation()
		stopInertia()
		const unit = event.deltaMode == 1 ? 16
			: event.deltaMode == 2 ? element.clientHeight : 1
		let dx = event.deltaX * unit, dy = event.deltaY * unit
		wheel.smooth = event.deltaMode != 0
			|| Math.max(Math.abs(dx), Math.abs(dy)) >= WHEEL_NOTCH_THRESHOLD
		// wheel while the left button is held: the click must not select a scene
		const held = (event.buttons & 1) != 0 || pointers.size > 0
		if (held)
			moved = true
		if (event.ctrlKey || event.metaKey || held) {
			// ctrl+wheel, click+wheel, or trackpad pinch on Chromium and Firefox
			const delta = dy || dx
			const [x, y] = local(event.clientX, event.clientY)
			wheel.x = x
			wheel.y = y
			wheel.zoom -= wheel.smooth
				? Math.sign(delta) * WHEEL_NOTCH_ZOOM
				: delta * PINCH_ZOOM_SPEED
		} else {
			if (event.shiftKey && dx == 0)
				[dx, dy] = [dy, 0]
			wheel.dx += dx
			wheel.dy += dy
		}
		if (!wheel.frame) {
			wheel.time = performance.now()
			wheel.frame = requestAnimationFrame(stepWheel)
		}
		onGestureStart?.()
	}

	const onGestureStartEvent = (event: Event) => {
		event.preventDefault()
		camera.stopAnimation()
		stopInertia()
		gestureScale = 1
		onGestureStart?.()
	}
	const onGestureChange = (event: Event) => {
		event.preventDefault()
		const { scale, clientX, clientY } = event as GestureEvent
		const [x, y] = local(clientX, clientY)
		camera.zoomAt(scale / gestureScale, x, y)
		gestureScale = scale
	}

	const controller = new AbortController()
	const { signal } = controller
	const passive = { passive: true, signal }
	element.addEventListener('pointerdown', onPointerDown, passive)
	window.addEventListener('pointermove', onPointerMove, passive)
	window.addEventListener('pointerup', onPointerUp, passive)
	window.addEventListener('pointercancel', onPointerUp, passive)
	element.addEventListener('click', onClick, { capture: true, signal })
	element.addEventListener('wheel', onWheel, { passive: false, signal })
	element.addEventListener('gesturestart', onGestureStartEvent, { signal })
	element.addEventListener('gesturechange', onGestureChange, { signal })

	return () => {
		controller.abort()
		stopInertia()
		stopWheel()
		camera.stopAnimation()
	}
}
