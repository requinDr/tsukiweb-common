import { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo } from "react"
import { autoUpdate, flip, useFloating, offset } from "@floating-ui/react"
import { createPortal } from "react-dom"
import * as m from "motion/react-m"
import { AnimatePresence } from "motion/react"


type WithId = { id: string }

type PopoverActionsType<T extends WithId> = {
	openPopover: (item: T, element: Element) => void
	closePopover: () => void
	closePopoverIfId: (id: string) => void
	togglePopover: (item: T, element: Element) => void
}
const PopoverActionsContext = createContext<PopoverActionsType<WithId> | null>(null)

let rootElement: HTMLElement | null = null
const getRootElement = () => {
	if (!rootElement) {
		rootElement = document.getElementById("root")
	}
	return rootElement as HTMLElement
}

const FLOATING_MIDDLEWARE = [flip(), offset(8)]

type PopoverProviderProps<T extends WithId> = {
	children: ReactNode
	renderContent: (item: T) => ReactNode
}
export const PopoverProvider = <T extends WithId>({ children, renderContent }: PopoverProviderProps<T>) => {
	const [currentItem, setCurrentItem] = useState<T | null>(null)
	const currentItemIdRef = useRef<string | null>(null)

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
		middleware: FLOATING_MIDDLEWARE
	})

	const openPopover = useCallback((item: T, element: Element) => {
		refs.setReference(element)
		currentItemIdRef.current = item.id
		setCurrentItem(item)
	}, [refs])

	const closePopover = useCallback(() => {
		currentItemIdRef.current = null
		setCurrentItem(null)
	}, [])

	// Close only if the specified item is currently open
	const closePopoverIfId = useCallback((id: string) => {
		if (currentItemIdRef.current === id) {
			currentItemIdRef.current = null
			setCurrentItem(null)
		}
	}, [])

	const togglePopover = useCallback((item: T, element: Element) => {
		if (currentItemIdRef.current === item.id) {
			closePopover()
		} else {
			openPopover(item, element)
		}
	}, [openPopover, closePopover])

	const actionsValue = useMemo(() => ({
		openPopover,
		closePopover,
		closePopoverIfId,
		togglePopover,
	}), [openPopover, closePopover, closePopoverIfId, togglePopover])

	return (
		<PopoverActionsContext.Provider value={actionsValue as PopoverActionsType<WithId>}>
			{children}
			{createPortal(
				<AnimatePresence mode="wait">
					{currentItem && (
						<div
							className="popover-container"
							ref={refs.setFloating}
							style={floatingStyles}
						>
							<m.div
								key={currentItem.id}
								className="scene-popover"
								initial={{ opacity: 0, y: 0 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 6 }}
								transition={{ type: "tween", duration: 0.15 }}
							>
								{renderContent(currentItem)}
							</m.div>
						</div>
					)}
				</AnimatePresence>,
				getRootElement()
			)}
		</PopoverActionsContext.Provider>
	)
}

export const usePopover = <T extends WithId>() => {
	const context = useContext(PopoverActionsContext)
	if (!context) {
		throw new Error("usePopover must be used within a PopoverProvider")
	}
	return context as PopoverActionsType<T>
}

const HOVER_DELAY_OPEN = 200
const HOVER_DELAY_CLOSE = 50

/**
 * Hook to attach hover/focus behavior to a scene element.
 * Returns stable props to spread on the reference element.
 * Does NOT cause re-renders when popover state changes.
 */
export const usePopoverTrigger = <T extends WithId>(item: T) => {
	const { openPopover, closePopoverIfId, togglePopover } = usePopover<T>()
	const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const elementRef = useRef<Element | null>(null)

	const clearTimeouts = useCallback(() => {
		if (hoverTimeoutRef.current) {
			clearTimeout(hoverTimeoutRef.current)
			hoverTimeoutRef.current = null
		}
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current)
			closeTimeoutRef.current = null
		}
	}, [])

	const handleMouseEnter = useCallback((e: React.MouseEvent) => {
		elementRef.current = e.currentTarget
		clearTimeouts()
		hoverTimeoutRef.current = setTimeout(() => {
			if (elementRef.current) openPopover(item, elementRef.current)
		}, HOVER_DELAY_OPEN)
	}, [item, openPopover, clearTimeouts])

	const handleMouseLeave = useCallback(() => {
		if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
		closePopoverIfId(item.id)
	}, [item.id, closePopoverIfId, clearTimeouts])

	const handleFocus = useCallback((e: React.FocusEvent) => {
		elementRef.current = e.currentTarget
		clearTimeouts()
		openPopover(item, e.currentTarget)
	}, [item, openPopover, clearTimeouts])

	const handleBlur = useCallback(() => {
		clearTimeouts()
		closeTimeoutRef.current = setTimeout(() => {
			closePopoverIfId(item.id)
		}, HOVER_DELAY_CLOSE)
	}, [item.id, closePopoverIfId, clearTimeouts])

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		togglePopover(item, e.currentTarget)
	}, [item, togglePopover])

	const setRef = useCallback((el: SVGGElement | null) => {
		elementRef.current = el
	}, [])

	return {
		ref: setRef,
		onMouseEnter: handleMouseEnter,
		onMouseLeave: handleMouseLeave,
		onFocus: handleFocus,
		onBlur: handleBlur,
		onContextMenu: handleContextMenu,
	}
}
