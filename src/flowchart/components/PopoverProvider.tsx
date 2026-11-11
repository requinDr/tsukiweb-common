import { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { useFloatPosition } from "../useFloatPosition"
import * as m from "motion/react-m"
import { AnimatePresence } from "motion/react"

type WithId = { id: string }

type PopoverActionsType<T extends WithId> = {
	openPopover: (item: T, element: Element) => void
	closePopover: () => void
}
const PopoverActionsContext = createContext<PopoverActionsType<WithId> | null>(null)
const PopoverRegistryContext = createContext<Map<string, () => WithId> | null>(null)


let isTouchActive = false
if (typeof document !== "undefined") {
	const opts = { passive: true, capture: true } as const
	document.addEventListener("touchstart",  () => { isTouchActive = true  }, opts)
	document.addEventListener("touchend",    () => { isTouchActive = false }, opts)
	document.addEventListener("touchcancel", () => { isTouchActive = false }, opts)
}

const LONG_PRESS_DELAY          = 500
const LONG_PRESS_MOVE_THRESHOLD = 10

type PopoverProviderProps<T extends WithId> = {
	children: ReactNode
	renderContent: (item: T) => ReactNode
}

export const PopoverProvider = <T extends WithId>({ children, renderContent }: PopoverProviderProps<T>) => {
	const [currentItem, setCurrentItem] = useState<T | null>(null)
	const [popoverMounted, setPopoverMounted] = useState(false)
	const animateEntryRef = useRef(true)
	const currentItemRef = useRef<T | null>(null)
	const popoverMountedRef = useRef(false)
	const registry = useMemo(() => new Map<string, () => T>(), [])

	const { setReference, setFloating, floatingStyles } = useFloatPosition(8)

	const openPopover = useCallback((item: T, element: Element) => {
		animateEntryRef.current = !popoverMountedRef.current
		popoverMountedRef.current = true
		currentItemRef.current = item
		setPopoverMounted(true)
		setReference(element)
		setCurrentItem(item)
	}, [setReference])

	const closePopover = useCallback(() => {
		currentItemRef.current = null
		setCurrentItem(null)
	}, [])

	const onExitComplete = useCallback(() => {
		if (currentItemRef.current === null) {
			popoverMountedRef.current = false
			setPopoverMounted(false)
		}
	}, [])

	// Delegated listeners
	useEffect(() => {
		let longPressTimer: ReturnType<typeof setTimeout> | undefined
		let startPos: { x: number, y: number } | null = null

		const resolve = (target: EventTarget | null): [T, Element] | null => {
			const el = (target as Element)?.closest?.("[data-popover-id]")
			if (!el) return null
			const getItem = registry.get(el.getAttribute("data-popover-id")!)
			return getItem ? [getItem(), el] : null
		}

		const clearLongPress = () => {
			clearTimeout(longPressTimer)
			startPos = null
		}

		// Desktop: hover
		const onMouseOver = (e: MouseEvent) => {
			if (isTouchActive) return
			const hit = resolve(e.target)
			if (hit) openPopover(...hit)
			else closePopover()
		}

		// Touch: long-press
		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType !== "touch") return
			const hit = resolve(e.target)
			if (!hit) return
			startPos = { x: e.clientX, y: e.clientY }
			longPressTimer = setTimeout(() => openPopover(...hit), LONG_PRESS_DELAY)
		}

		const onPointerMove = (e: PointerEvent) => {
			if (!startPos) return
			const dx = Math.abs(e.clientX - startPos.x)
			const dy = Math.abs(e.clientY - startPos.y)
			if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) clearLongPress()
		}

		// Touch: close on tap elsewhere
		const onPointerUp = (e: PointerEvent) => {
			if (e.pointerType !== "touch") return
			clearLongPress()
			if (!resolve(e.target)) closePopover()
		}

		const onContextMenu = (e: MouseEvent) => {
			if (resolve(e.target)) e.preventDefault()
		}

		// Accessibility/keyboard navigation: focus
		const onFocusIn = (e: FocusEvent) => {
			if (isTouchActive) return
			const hit = resolve(e.target)
			if (hit) openPopover(...hit)
		}

		const onFocusOut = (e: FocusEvent) => {
			if (isTouchActive) return
			if (!resolve(e.relatedTarget)) closePopover()
		}

		const controller = new AbortController()
		const { signal } = controller
		const passive = { passive: true, signal }
		document.addEventListener("mouseover",     onMouseOver,    { signal })
		document.addEventListener("pointerdown",   onPointerDown,  passive)
		document.addEventListener("pointermove",   onPointerMove,  passive)
		document.addEventListener("pointerup",     onPointerUp,    passive)
		document.addEventListener("pointercancel", clearLongPress, passive)
		document.addEventListener("contextmenu",   onContextMenu,  { signal })
		document.addEventListener("focusin",       onFocusIn,      { signal })
		document.addEventListener("focusout",      onFocusOut,     { signal })

		return () => {
			clearLongPress()
			controller.abort()
		}
	}, [openPopover, closePopover, registry])

	const actions = useMemo(() => ({ openPopover, closePopover }), [openPopover, closePopover])

	return (
		<PopoverActionsContext.Provider value={actions as PopoverActionsType<WithId>}>
			<PopoverRegistryContext.Provider value={registry as Map<string, () => WithId>}>
				{children}
				{createPortal(
					popoverMounted && (
						<div className="popover-container" ref={setFloating} style={floatingStyles}>
							<AnimatePresence onExitComplete={onExitComplete}>
								{currentItem && (
									<m.div
										key="popover"
										className="scene-popover-animated"
										initial={animateEntryRef.current ? { opacity: 0, scale: 1 } : false}
										animate={{ opacity: 1, scale: 1, transition: { type: "tween", duration: animateEntryRef.current ? 0.25 : 0 } }}
										exit={{ opacity: 0, scale: 0.98, transition: { type: "tween", duration: 0.25 } }}
									>
										{renderContent(currentItem)}
									</m.div>
								)}
							</AnimatePresence>
						</div>
					),
					document.getElementById("root")!
				)}
			</PopoverRegistryContext.Provider>
		</PopoverActionsContext.Provider>
	)
}

export const usePopoverTrigger = <T extends WithId>(item: T) => {
	const registry = useContext(PopoverRegistryContext)
	if (!registry) throw new Error("usePopoverTrigger must be used within a PopoverProvider")

	const itemRef = useRef(item)
	itemRef.current = item

	useEffect(() => {
		registry.set(item.id, () => itemRef.current as WithId)
		return () => { registry.delete(item.id) }
	}, [item.id, registry])

	return { "data-popover-id": item.id } as const
}

export const usePopover = <T extends WithId>() => {
	const ctx = useContext(PopoverActionsContext)
	if (!ctx) throw new Error("usePopover must be used within a PopoverProvider")
	return ctx as PopoverActionsType<T>
}