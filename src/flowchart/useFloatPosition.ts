import { useState, useRef, useCallback, useEffect, CSSProperties } from "react"

const FIXED_BASE: CSSProperties = { 
	position: "fixed", 
	top: 0, 
	left: 0, 
	willChange: "transform" 
}

function applyTranslate(el: HTMLElement, x: number, y: number) {
	el.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

export function useFloatPosition(offsetPx: number) {
	const referenceEl    = useRef<Element | null>(null)
	const floatingEl     = useRef<HTMLElement | null>(null)
	const rafToken       = useRef<number | null>(null)
	const cleanupResize  = useRef<(() => void) | null>(null)
	
	const floatSize      = useRef({ w: 0, h: 0 })
	const offsetPxRef    = useRef(offsetPx)
	offsetPxRef.current  = offsetPx

	const relativeShift  = useRef({ dx: 0, dy: 0 })
	const lastPos        = useRef({ x: -9999, y: -9999 })
	const lastRef        = useRef<Element | null>(null)

	const [floatingStyles, setFloatingStyles] = useState<CSSProperties | null>(null)

	const stopLoop = useCallback(() => {
		if (rafToken.current !== null) {
			cancelAnimationFrame(rafToken.current)
			rafToken.current = null
		}
	},[])

	const lockInitialPosition = useCallback(() => {
		const ref = referenceEl.current
		const el = floatingEl.current
		if (!ref || !el) return

		const rect = ref.getBoundingClientRect()
		const fw = floatSize.current.w
		const fh = floatSize.current.h
		const offset = offsetPxRef.current
		
		const SAFE_MARGIN = 16 

		const clampedY = Math.max(
			SAFE_MARGIN, 
			Math.min(rect.top + rect.height / 2 - fh / 2, window.innerHeight - fh - SAFE_MARGIN)
		)

		let clampedX: number
 
		const rightPos = rect.right + offset
		const leftPos = rect.left - offset - fw

		if (rightPos + fw <= window.innerWidth - SAFE_MARGIN) {
			// 1. Plan A: There is space on the right
			clampedX = rightPos
		} else if (leftPos >= SAFE_MARGIN) {
			// 2. Plan B: There is space on the left
			clampedX = leftPos
		} else {
			// 3. Plan C: No space on either side (Mobile phone).
			// Force it to stay visible on the screen.
			clampedX = Math.max(
				SAFE_MARGIN, 
				Math.min(rightPos, window.innerWidth - fw - SAFE_MARGIN)
			)
		}

		relativeShift.current = {
			dx: Math.round(clampedX) - rect.left,
			dy: Math.round(clampedY) - rect.top
		}
	}, [])

	const startLoop = useCallback(() => {
		stopLoop()
		const tick = () => {
			const ref = referenceEl.current
			const el  = floatingEl.current
			if (ref && el) {
				if (ref !== lastRef.current) {
					lockInitialPosition()
					lastRef.current = ref
				}
				const rect = ref.getBoundingClientRect()
				
				const x = Math.round(rect.left + relativeShift.current.dx)
				const y = Math.round(rect.top + relativeShift.current.dy)
				
				if (x !== lastPos.current.x || y !== lastPos.current.y) {
					applyTranslate(el, x, y)
					lastPos.current.x = x
					lastPos.current.y = y
				}
			}
			rafToken.current = requestAnimationFrame(tick)
		}
		rafToken.current = requestAnimationFrame(tick)
	}, [stopLoop, lockInitialPosition])

	useEffect(() => stopLoop, [stopLoop])

	const setReference = useCallback((el: Element | null) => {
		referenceEl.current = el
	},[])

	const setFloating = useCallback((el: HTMLElement | null) => {
		floatingEl.current = el
		if (!el) {
			stopLoop()
			cleanupResize.current?.()
			cleanupResize.current = null
			return
		}
		
		el.style.position = "fixed"
		el.style.top      = "0"
		el.style.left     = "0"
		floatSize.current = { w: el.offsetWidth, h: el.offsetHeight }
		
		if (referenceEl.current) {
			lockInitialPosition()
			
			const rect = referenceEl.current.getBoundingClientRect()
			const x = Math.round(rect.left + relativeShift.current.dx)
			const y = Math.round(rect.top + relativeShift.current.dy)
			
			applyTranslate(el, x, y)
			lastPos.current = { x, y }
			setFloatingStyles(FIXED_BASE)
		}

		const onResize = () => {
			if (floatingEl.current) {
				floatSize.current = { w: floatingEl.current.offsetWidth, h: floatingEl.current.offsetHeight }
				lockInitialPosition()
			}
		}
		
		window.addEventListener("resize", onResize, { passive: true })
		cleanupResize.current = () => window.removeEventListener("resize", onResize)

		startLoop()
	}, [stopLoop, startLoop, lockInitialPosition])

	return { setReference, setFloating, floatingStyles }
}