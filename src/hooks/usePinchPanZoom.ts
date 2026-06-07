import { RefObject, useEffect, useLayoutEffect, useRef } from "react"

type TouchPoint = {
	clientX: number
	clientY: number
}

type PinchPanZoomOptions<T extends Element> = {
	contentRef: RefObject<T | null>
	targetRef?: RefObject<EventTarget | null>
	scrollContainerRef?: RefObject<HTMLElement | null>
	minZoom?: number
	maxZoom?: number
	initialZoom?: number
	enabled?: boolean
	onZoom: (zoom: number) => void
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

export function usePinchPanZoom<T extends Element>({
	contentRef,
	targetRef,
	scrollContainerRef,
	minZoom = 0.5,
	maxZoom = 3,
	initialZoom = 1,
	enabled = true,
	onZoom,
}: PinchPanZoomOptions<T>) {
	const zoomRef = useRef(initialZoom)
	const optionsRef = useRef({
		minZoom,
		maxZoom,
		onZoom,
	})

	useLayoutEffect(() => {
		optionsRef.current = {
			minZoom,
			maxZoom,
			onZoom,
		}
	}, [minZoom, maxZoom, onZoom])

	useEffect(() => {
		if (!enabled) return

		const content = contentRef.current
		const target = targetRef?.current ?? content
		if (!content || !target) return

		const scrollContainer = scrollContainerRef?.current ?? findScrollContainer(content)
		let startDistance = 0
		let startZoom = zoomRef.current
		let lastCenter: TouchPoint | null = null
		let raf = 0
		let pendingZoom: number | null = null
		let pendingCenter: TouchPoint | null = null

		const applyZoomAt = (zoom: number, center: TouchPoint) => {
			const previousZoom = zoomRef.current
			const previousCenter = lastCenter ?? center
			const contentRect = content.getBoundingClientRect()
			const scrollRect = scrollContainer.getBoundingClientRect()
			const originX = contentRect.left - scrollRect.left + scrollContainer.scrollLeft
			const originY = contentRect.top - scrollRect.top + scrollContainer.scrollTop
			const anchorX = (
				scrollContainer.scrollLeft + previousCenter.clientX - scrollRect.left - originX
			) / previousZoom
			const anchorY = (
				scrollContainer.scrollTop + previousCenter.clientY - scrollRect.top - originY
			) / previousZoom

			optionsRef.current.onZoom(zoom)
			scrollContainer.scrollLeft = originX + anchorX * zoom - (center.clientX - scrollRect.left)
			scrollContainer.scrollTop = originY + anchorY * zoom - (center.clientY - scrollRect.top)
			zoomRef.current = zoom
			lastCenter = center
		}

		const scheduleZoom = (zoom: number, center: TouchPoint) => {
			pendingZoom = zoom
			pendingCenter = center
			if (raf) return

			raf = requestAnimationFrame(() => {
				raf = 0
				if (pendingZoom === null || !pendingCenter) return
				applyZoomAt(pendingZoom, pendingCenter)
				pendingZoom = null
				pendingCenter = null
			})
		}

		const resetGesture = (touches: TouchList) => {
			if (touches.length < 2) {
				startDistance = 0
				lastCenter = null
				return
			}
			startDistance = getTouchDistance(touches)
			startZoom = zoomRef.current
			lastCenter = getTouchCenter(touches)
		}

		const onTouchStart = (event: TouchEvent) => {
			if (event.touches.length < 2) return
			if (event.cancelable) event.preventDefault()
			resetGesture(event.touches)
		}

		const onTouchMove = (event: TouchEvent) => {
			if (event.touches.length < 2 || !startDistance) return
			if (event.cancelable) event.preventDefault()

			const nextZoom = clamp(
				startZoom * getTouchDistance(event.touches) / startDistance,
				optionsRef.current.minZoom,
				optionsRef.current.maxZoom
			)
			scheduleZoom(nextZoom, getTouchCenter(event.touches))
		}

		const onTouchEnd = (event: TouchEvent) => {
			resetGesture(event.touches)
		}

		const touchStartListener = onTouchStart as EventListener
		const touchMoveListener = onTouchMove as EventListener
		const touchEndListener = onTouchEnd as EventListener

		target.addEventListener('touchstart', touchStartListener, { passive: false })
		target.addEventListener('touchmove', touchMoveListener, { passive: false })
		target.addEventListener('touchend', touchEndListener, { passive: true })
		target.addEventListener('touchcancel', touchEndListener, { passive: true })

		return () => {
			if (raf) cancelAnimationFrame(raf)
			target.removeEventListener('touchstart', touchStartListener)
			target.removeEventListener('touchmove', touchMoveListener)
			target.removeEventListener('touchend', touchEndListener)
			target.removeEventListener('touchcancel', touchEndListener)
		}
	}, [contentRef, enabled, scrollContainerRef, targetRef])

	return zoomRef
}
