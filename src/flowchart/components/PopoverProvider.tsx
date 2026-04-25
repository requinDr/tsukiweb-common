import { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo, useEffect } from "react"
import { autoUpdate, flip, useFloating, offset } from "@floating-ui/react"
import { createPortal } from "react-dom"
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

let rootElement: HTMLElement | null = null
const getRootElement = () => {
	if (!rootElement) rootElement = document.getElementById("root")
	return rootElement as HTMLElement
}

const LONG_PRESS_DELAY          = 500
const LONG_PRESS_MOVE_THRESHOLD = 10

type PopoverProviderProps<T extends WithId> = {
	children: ReactNode
	renderContent: (item: T) => ReactNode
}

export const PopoverProvider = <T extends WithId>({ children, renderContent }: PopoverProviderProps<T>) => {
	const [currentItem, setCurrentItem] = useState<T | null>(null)
	const registry = useMemo(() => new Map<string, () => T>(), [])

	const { refs, floatingStyles } = useFloating({
		strategy: "absolute",
		placement: "right",
		open: currentItem !== null,
		whileElementsMounted: (reference, floating, update) =>
			autoUpdate(reference, floating, update, {
				animationFrame: false,
				ancestorScroll: true,
				ancestorResize: false,
				elementResize: false,
				layoutShift: false,
			}),
		middleware: [flip(), offset(8)],
	})

	const openPopover = useCallback((item: T, element: Element) => {
		refs.setReference(element)
		setCurrentItem(item)
	}, [refs])

	const closePopover = useCallback(() => setCurrentItem(null), [])

	// Delegated listeners
	useEffect(() => {
		const longPressTimer = { current: null as ReturnType<typeof setTimeout> | null }
		const startPos       = { current: null as { x: number; y: number } | null }

		const resolve = (target: EventTarget | null): [Element, T] | null => {
			const el = (target as Element)?.closest?.("[data-popover-id]")
			if (!el) return null
			const getItem = registry.get(el.getAttribute("data-popover-id")!)
			return getItem ? [el, getItem()] : null
		}

		const clearLongPress = () => {
			if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
			startPos.current = null
		}

		// Desktop: hover
		const onMouseOver = (e: MouseEvent) => {
			const hit = resolve(e.target)
			if (hit) openPopover(hit[1], hit[0])
			else closePopover()
		}

		// Touch: long-press
		const onPointerDown = (e: PointerEvent) => {
			if (e.pointerType !== "touch") return
			const hit = resolve(e.target)
			if (!hit) return
			startPos.current = { x: e.clientX, y: e.clientY }
			longPressTimer.current = setTimeout(() => openPopover(hit[1], hit[0]), LONG_PRESS_DELAY)
		}

		const onPointerMove = (e: PointerEvent) => {
			if (!startPos.current) return
			const dx = Math.abs(e.clientX - startPos.current.x)
			const dy = Math.abs(e.clientY - startPos.current.y)
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
			if (hit) openPopover(hit[1], hit[0])
		}

		const onFocusOut = (e: FocusEvent) => {
			if (isTouchActive) return
			if (!resolve(e.relatedTarget)) closePopover()
		}

		const p = { passive: true }
		document.addEventListener("mouseover",   onMouseOver)
		document.addEventListener("pointerdown", onPointerDown, p)
		document.addEventListener("pointermove", onPointerMove, p)
		document.addEventListener("pointerup",   onPointerUp,   p)
		document.addEventListener("contextmenu", onContextMenu)
		document.addEventListener("focusin",     onFocusIn)
		document.addEventListener("focusout",    onFocusOut)

		return () => {
			clearLongPress()
			document.removeEventListener("mouseover",   onMouseOver)
			document.removeEventListener("pointerdown", onPointerDown)
			document.removeEventListener("pointermove", onPointerMove)
			document.removeEventListener("pointerup",   onPointerUp)
			document.removeEventListener("contextmenu", onContextMenu)
			document.removeEventListener("focusin",     onFocusIn)
			document.removeEventListener("focusout",    onFocusOut)
		}
	}, [openPopover, closePopover, registry])

	const actions = useMemo(() => ({ openPopover, closePopover }), [openPopover, closePopover])

	return (
		<PopoverActionsContext.Provider value={actions as PopoverActionsType<WithId>}>
			<PopoverRegistryContext.Provider value={registry as Map<string, () => WithId>}>
				{children}
				{createPortal(
					<AnimatePresence mode="wait">
						{currentItem && (
							<div className="popover-container" ref={refs.setFloating} style={floatingStyles}>
								<m.div
									key={currentItem.id}
									className="scene-popover"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={{ type: "tween", duration: 0.25 }}
								>
									{renderContent(currentItem)}
								</m.div>
							</div>
						)}
					</AnimatePresence>,
					getRootElement()
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