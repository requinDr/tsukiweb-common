import { useLayoutEffect, type RefObject } from "react"

const DRAG_THRESHOLD = 6
const INERTIA_FRICTION = 0.92
const INERTIA_STOP_SPEED = 0.02

type Point = { x: number, y: number }

type Pinch = {
	anchorX: number
	anchorY: number
	center: Point
	elementLeft: number
	elementTop: number
	frozen: boolean
	ids: [number, number]
	startCenter: Point
	startDistance: number
	startZoom: number
	zoom: number
}

type MouseDrag = {
	lastScrollLeft: number
	lastScrollTop: number
	lastTime: number
	pointerId: number
	startClientX: number
	startClientY: number
	startScrollLeft: number
	startScrollTop: number
}

export type PanZoomOptions = {
	maxScale?: number
	minScale?: number
	minVisible?: number
	stageRef?: RefObject<HTMLElement | null>
	viewportSelector?: string
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value))

const getTouch = (touches: TouchList, id: number) => {
	for (let index = 0; index < touches.length; index++) {
		if (touches[index].identifier === id)
			return touches[index]
	}
}

const getTouchMetrics = (a: Touch, b: Touch) => ({
	center: {x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2},
	distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
})

export const usePanZoom = <T extends HTMLElement | SVGElement>(
	elementRef: RefObject<T | null>,
	{
		maxScale = 4,
		minScale = 0.125,
		minVisible = 0,
		stageRef,
		viewportSelector,
	}: PanZoomOptions = {}
) => {
	useLayoutEffect(() => {
		const element = elementRef.current
		const stage = stageRef?.current ?? element?.parentElement
		const container = stage?.parentElement
		if (!element || !stage || !container)
			return
		const viewport = viewportSelector ? container.closest(viewportSelector) ?? container : container
		if (!(viewport instanceof HTMLElement))
			return

		const previousElementStyles = {
			transform: element.style.transform,
			transformOrigin: element.style.transformOrigin,
			willChange: element.style.willChange,
			zoom: element.style.getPropertyValue('zoom'),
		}
		const previousStageStyles = {
			paddingBottom: stage.style.paddingBottom,
			paddingLeft: stage.style.paddingLeft,
			paddingRight: stage.style.paddingRight,
			paddingTop: stage.style.paddingTop,
		}

		let zoom = clamp(Number.parseFloat(getComputedStyle(element).zoom) || 1, minScale, maxScale)
		let gutterBottom = 0
		let gutterLeft = 0
		let gutterRight = 0
		let gutterTop = 0
		let pinch: Pinch | null = null
		let pendingPinch: {center: Point, distance: number} | null = null
		let pinchFrame = 0
		let mouseDrag: MouseDrag | null = null
		let mouseEvent: PointerEvent | null = null
		let mouseFrame = 0
		let inertiaFrame = 0
		let velocityX = 0
		let velocityY = 0
		let gestureMoved = false

		element.style.transform = ''
		element.style.transformOrigin = '0 0'
		element.style.setProperty('zoom', String(zoom))

		const removePinchListeners = () => {
			document.removeEventListener('touchstart', onAdditionalTouch)
			document.removeEventListener('touchmove', onTouchMove)
			document.removeEventListener('touchend', onTouchEnd)
			document.removeEventListener('touchcancel', onTouchCancel)
		}

		const restorePinchStyles = () => {
			element.style.transform = ''
			element.style.willChange = previousElementStyles.willChange
		}

		function cancelPinch() {
			cancelAnimationFrame(pinchFrame)
			pinchFrame = 0
			pendingPinch = null
			pinch = null
			restorePinchStyles()
			removePinchListeners()
		}

		const updateGutters = () => {
			const style = getComputedStyle(container)
			const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
			const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
			const paddingRight = Number.parseFloat(style.paddingRight) || 0
			const paddingTop = Number.parseFloat(style.paddingTop) || 0
			const nextBottom = Math.max(0, viewport.clientHeight - minVisible - paddingBottom)
			const nextLeft = Math.max(0, viewport.clientWidth - minVisible - paddingLeft)
			const nextRight = Math.max(0, viewport.clientWidth - minVisible - paddingRight)
			const nextTop = Math.max(0, viewport.clientHeight - minVisible - paddingTop)
			if (
				nextBottom === gutterBottom
				&& nextLeft === gutterLeft
				&& nextRight === gutterRight
				&& nextTop === gutterTop
			)
				return
			if (pinch)
				cancelPinch()

			stage.style.paddingBottom = `${nextBottom}px`
			stage.style.paddingLeft = `${nextLeft}px`
			stage.style.paddingRight = `${nextRight}px`
			stage.style.paddingTop = `${nextTop}px`
			viewport.scrollLeft += nextLeft - gutterLeft
			viewport.scrollTop += nextTop - gutterTop
			gutterBottom = nextBottom
			gutterLeft = nextLeft
			gutterRight = nextRight
			gutterTop = nextTop
		}

		const setZoomAt = (nextZoom: number, center: Point, anchor?: Point) => {
			const currentRect = element.getBoundingClientRect()
			const local = anchor ?? {
				x: (center.x - currentRect.left) / zoom,
				y: (center.y - currentRect.top) / zoom,
			}
			zoom = clamp(nextZoom, minScale, maxScale)
			element.style.transform = ''
			element.style.setProperty('zoom', String(zoom))
			const nextRect = element.getBoundingClientRect()
			viewport.scrollLeft += nextRect.left + local.x * zoom - center.x
			viewport.scrollTop += nextRect.top + local.y * zoom - center.y
		}

		const applyPinch = () => {
			pinchFrame = 0
			if (!pinch || !pendingPinch || pinch.frozen)
				return
			const {center, distance} = pendingPinch
			pendingPinch = null
			const nextZoom = clamp(pinch.startZoom * distance / pinch.startDistance, minScale, maxScale)
			const translateX = (center.x - pinch.elementLeft - pinch.anchorX * nextZoom) / pinch.startZoom
			const translateY = (center.y - pinch.elementTop - pinch.anchorY * nextZoom) / pinch.startZoom
			const scale = nextZoom / pinch.startZoom

			pinch.center = center
			pinch.zoom = nextZoom
			if (
				Math.hypot(center.x - pinch.startCenter.x, center.y - pinch.startCenter.y) > DRAG_THRESHOLD
				|| Math.abs(nextZoom - pinch.startZoom) > 0.01
			)
				gestureMoved = true
			element.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`
		}

		const flushPinch = () => {
			cancelAnimationFrame(pinchFrame)
			applyPinch()
		}

		const commitPinch = () => {
			if (!pinch)
				return
			flushPinch()
			const snapshot = pinch
			pinch = null
			pendingPinch = null
			setZoomAt(snapshot.zoom, snapshot.center, {x: snapshot.anchorX, y: snapshot.anchorY})
			element.style.willChange = previousElementStyles.willChange
			removePinchListeners()
		}

		const onAdditionalTouch = (event: TouchEvent) => {
			if (pinch && event.cancelable)
				event.preventDefault()
		}

		const onTouchMove = (event: TouchEvent) => {
			if (!pinch)
				return
			if (event.cancelable)
				event.preventDefault()
			if (pinch.frozen)
				return
			const a = getTouch(event.touches, pinch.ids[0])
			const b = getTouch(event.touches, pinch.ids[1])
			if (!a || !b) {
				pinch.frozen = true
				return
			}
			pendingPinch = getTouchMetrics(a, b)
			if (!pinchFrame)
				pinchFrame = requestAnimationFrame(applyPinch)
		}

		const onTouchEnd = (event: TouchEvent) => {
			if (!pinch)
				return
			if (event.cancelable)
				event.preventDefault()
			if (event.touches.length === 0) {
				commitPinch()
				return
			}
			if (!getTouch(event.touches, pinch.ids[0]) || !getTouch(event.touches, pinch.ids[1]))
				pinch.frozen = true
		}

		const onTouchCancel = () => cancelPinch()

		const onTouchStart = (event: TouchEvent) => {
			if (pinch) {
				if (event.cancelable)
					event.preventDefault()
				return
			}
			if (event.touches.length < 2)
				return
			if (event.cancelable)
				event.preventDefault()

			cancelAnimationFrame(inertiaFrame)
			const a = event.touches[0]
			const b = event.touches[1]
			const {center, distance} = getTouchMetrics(a, b)
			const rect = element.getBoundingClientRect()
			gestureMoved = false
			pinch = {
				anchorX: (center.x - rect.left) / zoom,
				anchorY: (center.y - rect.top) / zoom,
				center,
				elementLeft: rect.left,
				elementTop: rect.top,
				frozen: false,
				ids: [a.identifier, b.identifier],
				startCenter: center,
				startDistance: Math.max(distance, 1),
				startZoom: zoom,
				zoom,
			}
			element.style.willChange = 'transform'
			document.addEventListener('touchstart', onAdditionalTouch, {passive: false})
			document.addEventListener('touchmove', onTouchMove, {passive: false})
			document.addEventListener('touchend', onTouchEnd, {passive: false})
			document.addEventListener('touchcancel', onTouchCancel, {passive: true})
		}

		const stopMouseListeners = () => {
			document.removeEventListener('pointermove', onMouseMove)
			document.removeEventListener('pointerup', onMouseUp)
			document.removeEventListener('pointercancel', onMouseUp)
		}

		const applyMouseMove = () => {
			mouseFrame = 0
			if (!mouseDrag || !mouseEvent)
				return
			const event = mouseEvent
			mouseEvent = null
			viewport.scrollLeft = mouseDrag.startScrollLeft - (event.clientX - mouseDrag.startClientX)
			viewport.scrollTop = mouseDrag.startScrollTop - (event.clientY - mouseDrag.startClientY)
			const now = performance.now()
			const elapsed = now - mouseDrag.lastTime
			if (elapsed > 0) {
				velocityX = (velocityX + (viewport.scrollLeft - mouseDrag.lastScrollLeft) / elapsed) / 2
				velocityY = (velocityY + (viewport.scrollTop - mouseDrag.lastScrollTop) / elapsed) / 2
			}
			mouseDrag.lastScrollLeft = viewport.scrollLeft
			mouseDrag.lastScrollTop = viewport.scrollTop
			mouseDrag.lastTime = now
			if (Math.hypot(event.clientX - mouseDrag.startClientX, event.clientY - mouseDrag.startClientY) > DRAG_THRESHOLD)
				gestureMoved = true
		}

		const flushMouseMove = () => {
			cancelAnimationFrame(mouseFrame)
			applyMouseMove()
		}

		const startMouseInertia = () => {
			let previousTime = performance.now()
			const glide = (time: number) => {
				const elapsed = Math.min(time - previousTime, 32)
				previousTime = time
				const friction = Math.pow(INERTIA_FRICTION, elapsed / (1000 / 60))
				velocityX *= friction
				velocityY *= friction
				if (Math.hypot(velocityX, velocityY) < INERTIA_STOP_SPEED)
					return

				const previousLeft = viewport.scrollLeft
				const previousTop = viewport.scrollTop
				viewport.scrollLeft += velocityX * elapsed
				viewport.scrollTop += velocityY * elapsed
				if (viewport.scrollLeft === previousLeft)
					velocityX = 0
				if (viewport.scrollTop === previousTop)
					velocityY = 0
				inertiaFrame = requestAnimationFrame(glide)
			}
			inertiaFrame = requestAnimationFrame(glide)
		}

		const onMouseMove = (event: PointerEvent) => {
			if (!mouseDrag || event.pointerId !== mouseDrag.pointerId)
				return
			mouseEvent = event
			if (!mouseFrame)
				mouseFrame = requestAnimationFrame(applyMouseMove)
		}

		const onMouseUp = (event: PointerEvent) => {
			if (!mouseDrag || event.pointerId !== mouseDrag.pointerId)
				return
			mouseEvent = event
			flushMouseMove()
			mouseDrag = null
			stopMouseListeners()
			if (gestureMoved)
				startMouseInertia()
		}

		const onPointerDown = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse' || event.button !== 0)
				return
			cancelAnimationFrame(inertiaFrame)
			gestureMoved = false
			velocityX = 0
			velocityY = 0
			mouseDrag = {
				lastScrollLeft: viewport.scrollLeft,
				lastScrollTop: viewport.scrollTop,
				lastTime: performance.now(),
				pointerId: event.pointerId,
				startClientX: event.clientX,
				startClientY: event.clientY,
				startScrollLeft: viewport.scrollLeft,
				startScrollTop: viewport.scrollTop,
			}
			document.addEventListener('pointermove', onMouseMove, {passive: true})
			document.addEventListener('pointerup', onMouseUp, {passive: true})
			document.addEventListener('pointercancel', onMouseUp, {passive: true})
		}

		const onClick = (event: MouseEvent) => {
			if (!gestureMoved || event.detail === 0)
				return
			event.preventDefault()
			event.stopPropagation()
			gestureMoved = false
		}

		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey)
				return
			event.preventDefault()
			cancelAnimationFrame(inertiaFrame)
			const delta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY
			setZoomAt(zoom * Math.exp((delta < 0 ? 1 : -1) * 0.1), {x: event.clientX, y: event.clientY})
		}

		updateGutters()
		const resizeObserver = new ResizeObserver(updateGutters)
		resizeObserver.observe(viewport)
		stage.addEventListener('touchstart', onTouchStart, {passive: false})
		stage.addEventListener('pointerdown', onPointerDown)
		stage.addEventListener('click', onClick, true)
		stage.addEventListener('wheel', onWheel, {passive: false})

		return () => {
			cancelAnimationFrame(inertiaFrame)
			cancelAnimationFrame(mouseFrame)
			cancelAnimationFrame(pinchFrame)
			resizeObserver.disconnect()
			removePinchListeners()
			stopMouseListeners()
			stage.removeEventListener('touchstart', onTouchStart)
			stage.removeEventListener('pointerdown', onPointerDown)
			stage.removeEventListener('click', onClick, true)
			stage.removeEventListener('wheel', onWheel)
			viewport.scrollLeft -= gutterLeft
			viewport.scrollTop -= gutterTop
			Object.assign(element.style, previousElementStyles)
			stage.style.paddingBottom = previousStageStyles.paddingBottom
			stage.style.paddingLeft = previousStageStyles.paddingLeft
			stage.style.paddingRight = previousStageStyles.paddingRight
			stage.style.paddingTop = previousStageStyles.paddingTop
		}
	}, [elementRef, maxScale, minScale, minVisible, stageRef, viewportSelector])
}