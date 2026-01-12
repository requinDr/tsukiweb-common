import { ComponentProps, useCallback, useEffect, useRef, useState } from "react"
import styles from '../styles/modal.module.scss'
import { createPortal } from "react-dom"
import dialogPolyfill from 'dialog-polyfill'
import 'dialog-polyfill/dist/dialog-polyfill.css'

type Props = ComponentProps<'dialog'> & {
	show: boolean
	onRequestClose: () => void
	children: React.ReactNode
	shouldCloseOnEsc?: boolean
}

const Modal = ({ show, onRequestClose, children, shouldCloseOnEsc = true, ...props }: Props) => {
	const { render, setRef, ref } = useDialog(show, styles.isClosing)

	useEffect(() => {
		if (!shouldCloseOnEsc || !show) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				onRequestClose()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [show, shouldCloseOnEsc, onRequestClose])

	const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
		const dialogElement = ref.current
		if (!dialogElement) return

		const rect = dialogElement.getBoundingClientRect()
		const isInDialog = (
			e.clientX >= rect.left &&
			e.clientX <= rect.right &&
			e.clientY >= rect.top &&
			e.clientY <= rect.bottom
		)

		if (!isInDialog) {
			onRequestClose()
		}
	}

	if (!render) return null

	return createPortal(
		<dialog
			{...props}
			ref={setRef}
			className={`${styles.modal} modal ${props.className||""}`}
			onCancel={(e) => { e.preventDefault(); onRequestClose() }}
			onClick={handleBackdropClick}
			nav-root={1}
		>
			{children}
		</dialog>
		, document.body
	)
}

export default Modal



const useDialog = (show: boolean, isClosingClass: string) => {
const [render, setRender] = useState(show)
	const ref = useRef<HTMLDialogElement>(null)

	const setRef = useCallback((node: HTMLDialogElement | null) => {
		if (node && !node.showModal) {
			dialogPolyfill.registerDialog(node)
		}
		(ref as any).current = node
	}, [])

	useEffect(() => {
		if (show) setRender(true)
	}, [show])

	useEffect(() => {
		const node = ref.current
		if (!node) return

		if (show && !node.open) {
			node.showModal()
		} else if (!show && node.open) {
			node.classList.add(isClosingClass)
			node.onanimationend = () => {
				node.close()
				node.classList.remove(isClosingClass)
				setRender(false)
			}
		}
	}, [show, render, isClosingClass])

	return { render, setRef, ref }
}