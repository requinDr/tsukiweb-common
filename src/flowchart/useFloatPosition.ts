import { useRef, useCallback, CSSProperties } from "react"

const SAFE_MARGIN = 16

const FLOATING_STYLE: CSSProperties = {
	position: "fixed",
	top: 0,
	left: 0,
	willChange: "transform"
}

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(value, max))

export function useFloatPosition(offsetPx: number) {
	const referenceEl = useRef<Element | null>(null)
	const offsetRef = useRef(offsetPx)
	offsetRef.current = offsetPx

	const setReference = useCallback((el: Element | null) => {
		referenceEl.current = el
	}, [])

	const setFloating = useCallback((el: HTMLElement | null) => {
		if (!el)
			return
		let width = el.offsetWidth, height = el.offsetHeight
		let anchor: Element | null = null
		let shift = { dx: 0, dy: 0 }
		let transform = ""
		let frame = 0

		const anchorTo = (ref: Element) => {
			const rect = ref.getBoundingClientRect()
			const maxX = window.innerWidth - width - SAFE_MARGIN
			const rightPos = rect.right + offsetRef.current
			const leftPos = rect.left - offsetRef.current - width
			const x = rightPos <= maxX ? rightPos
				: leftPos >= SAFE_MARGIN ? leftPos
				: clamp(rightPos, SAFE_MARGIN, maxX)
			const y = clamp(rect.top + rect.height / 2 - height / 2,
				SAFE_MARGIN, window.innerHeight - height - SAFE_MARGIN)
			shift = { dx: Math.round(x) - rect.left, dy: Math.round(y) - rect.top }
			anchor = ref
		}

		const follow = () => {
			const ref = referenceEl.current
			if (!ref)
				return
			if (ref !== anchor)
				anchorTo(ref)
			const rect = ref.getBoundingClientRect()
			const x = Math.round(rect.left + shift.dx)
			const y = Math.round(rect.top + shift.dy)
			const next = `translate3d(${x}px, ${y}px, 0)`
			if (next !== transform)
				el.style.transform = transform = next
		}

		const tick = () => {
			follow()
			frame = requestAnimationFrame(tick)
		}

		const onResize = () => {
			width = el.offsetWidth
			height = el.offsetHeight
			anchor = null
		}

		window.addEventListener("resize", onResize, { passive: true })
		tick()

		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener("resize", onResize)
		}
	}, [])

	return { setReference, setFloating, floatingStyles: FLOATING_STYLE }
}
