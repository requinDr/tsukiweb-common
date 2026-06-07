import { RefObject, useEffect, useLayoutEffect, useRef } from "react"

type TouchPoint = {
	clientX: number
	clientY: number
}

type ZoomElement = HTMLElement | SVGElement

type PinchPanZoomOptions<T extends ZoomElement> = {
	contentRef: RefObject<T | null>
	targetRef?: RefObject<HTMLElement | SVGElement | null>
	scrollContainerRef?: RefObject<HTMLElement | null>
	minZoom?: number
	maxZoom?: number
	initialZoom?: number
	enabled?: boolean
	onZoomCommit: (zoom: number) => void
}

type GestureSnapshot = {
	anchorX: number
	anchorY: number
	center: TouchPoint
	contentLeft: number
	contentTop: number
	previousTransform: string
	previousTransformBox: string
	previousTransformOrigin: string
	previousWillChange: string
	startDistance: number
	startZoom: number
	zoom: number
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value))

const getTouchCenter = (touches: TouchList): TouchPoint => ({
	clientX: (touches[0].clientX + touches[1].clientX) / 2,
	clientY: (touches[0].clientY + touches[1].clientY) / 2,
})

const getTouchDistance = (touches: TouchList) =>
	Math.hypot(
		touches[0].clientX - touches[1].clientX,
		touches[0].clientY - touches[1].clientY
	)

const findScrollContainer = (element: Element): HTMLElement => {
	let current: Element | null = element
	while (current && current !== document.body) {
		if (current instanceof HTMLElement) {
			const style = getComputedStyle(current)
			if (/(auto|scroll|overlay)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`))
				return current
		}
		current = current.parentElement
	}
	return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function usePinchPanZoom<T extends ZoomElement>({
	contentRef,
	targetRef,
	scrollContainerRef,
	minZoom = 0.5,
	maxZoom = 3,
	initialZoom = 1,
	enabled = true,
	onZoomCommit,
}: PinchPanZoomOptions<T>) {
	const zoomRef = useRef(initialZoom)
	const optionsRef = useRef({
		minZoom,
		maxZoom,
		onZoomCommit,
	})

	useLayoutEffect(() => {
		optionsRef.current = {
			minZoom,
			maxZoom,
			onZoomCommit,
		}
	}, [minZoom, maxZoom, onZoomCommit])

	useEffect(() => {
		if (!enabled) return

		const content = contentRef.current
		const target = targetRef?.current ?? content
		if (!content || !target) return

		const scrollContainer = scrollContainerRef?.current ?? findScrollContainer(content)
		let gesture: GestureSnapshot | null = null
		let raf = 0
		let pending: { zoom: number; center: TouchPoint } | null = null

		const restoreGestureStyles = (snapshot: GestureSnapshot) => {
			content.style.transform = snapshot.previousTransform
			content.style.transformOrigin = snapshot.previousTransformOrigin
			content.style.willChange = snapshot.previousWillChange
			content.style.setProperty('transform-box', snapshot.previousTransformBox)
		}

		const startGesture = (touches: TouchList) => {
			const center = getTouchCenter(touches)
			const startDistance = getTouchDistance(touches)
			const startZoom = zoomRef.current
			const contentRect = content.getBoundingClientRect()
			const scrollRect = scrollContainer.getBoundingClientRect()
			const originX = contentRect.left - scrollRect.left + scrollContainer.scrollLeft
			const originY = contentRect.top - scrollRect.top + scrollContainer.scrollTop
			const anchorX = (
				scrollContainer.scrollLeft + center.clientX - scrollRect.left - originX
			) / startZoom
			const anchorY = (
				scrollContainer.scrollTop + center.clientY - scrollRect.top - originY
			) / startZoom

			gesture = {
				anchorX,
				anchorY,
				center,
				contentLeft: contentRect.left,
				contentTop: contentRect.top,
				previousTransform: content.style.transform,
				previousTransformBox: content.style.getPropertyValue('transform-box'),
				previousTransformOrigin: content.style.transformOrigin,
				previousWillChange: content.style.willChange,
				startDistance,
				startZoom,
				zoom: startZoom,
			}

			content.style.transformOrigin = '0 0'
			content.style.setProperty('transform-box', 'border-box')
			content.style.willChange = 'transform'
		}

		const applyTransform = (zoom: number, center: TouchPoint) => {
			if (!gesture) return

			const scale = zoom / gesture.startZoom
			const translateX = center.clientX - (
				gesture.contentLeft + gesture.anchorX * gesture.startZoom * scale
			)
			const translateY = center.clientY - (
				gesture.contentTop + gesture.anchorY * gesture.startZoom * scale
			)

			gesture.zoom = zoom
			gesture.center = center
			content.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`
		}

		const scheduleZoom = (zoom: number, center: TouchPoint) => {
			pending = { zoom, center }
			if (raf) return

			raf = requestAnimationFrame(() => {
				raf = 0
				if (!pending) return
				applyTransform(pending.zoom, pending.center)
				pending = null
			})
		}

		const commitGesture = () => {
			if (!gesture) return
			if (raf) {
				cancelAnimationFrame(raf)
				raf = 0
			}
			if (pending) {
				applyTransform(pending.zoom, pending.center)
				pending = null
			}

			const snapshot = gesture
			const finalZoom = snapshot.zoom
			const finalCenter = snapshot.center
			gesture = null

			restoreGestureStyles(snapshot)
			zoomRef.current = finalZoom
			optionsRef.current.onZoomCommit(finalZoom)

			const contentRect = content.getBoundingClientRect()
			const scrollRect = scrollContainer.getBoundingClientRect()
			const originX = contentRect.left - scrollRect.left + scrollContainer.scrollLeft
			const originY = contentRect.top - scrollRect.top + scrollContainer.scrollTop
			const nextScrollLeft = originX + snapshot.anchorX * finalZoom - (finalCenter.clientX - scrollRect.left)
			const nextScrollTop = originY + snapshot.anchorY * finalZoom - (finalCenter.clientY - scrollRect.top)

			requestAnimationFrame(() => {
				scrollContainer.scrollLeft = nextScrollLeft
				scrollContainer.scrollTop = nextScrollTop
			})
		}

		const onTouchStart = (event: TouchEvent) => {
			if (event.touches.length < 2) return
			if (event.cancelable) event.preventDefault()
			if (gesture)
				commitGesture()
			startGesture(event.touches)
		}

		const onTouchMove = (event: TouchEvent) => {
			if (event.touches.length < 2 || !gesture) return
			if (event.cancelable) event.preventDefault()

			const nextZoom = clamp(
				gesture.startZoom * getTouchDistance(event.touches) / gesture.startDistance,
				optionsRef.current.minZoom,
				optionsRef.current.maxZoom
			)
			scheduleZoom(nextZoom, getTouchCenter(event.touches))
		}

		const onTouchEnd = () => {
			if (!gesture) return
			commitGesture()
		}

		target.addEventListener('touchstart', onTouchStart as EventListener, { passive: false })
		target.addEventListener('touchmove', onTouchMove as EventListener, { passive: false })
		target.addEventListener('touchend', onTouchEnd as EventListener, { passive: true })
		target.addEventListener('touchcancel', onTouchEnd, { passive: true })

		return () => {
			if (raf) cancelAnimationFrame(raf)
			if (gesture)
				restoreGestureStyles(gesture)
			target.removeEventListener('touchstart', onTouchStart as EventListener)
			target.removeEventListener('touchmove', onTouchMove as EventListener)
			target.removeEventListener('touchend', onTouchEnd as EventListener)
			target.removeEventListener('touchcancel', onTouchEnd)
		}
	}, [contentRef, enabled, scrollContainerRef, targetRef])

	return zoomRef
}
