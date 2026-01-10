import { ComponentProps, useEffect, useRef, useState } from "react"
import styles from '../styles/modal.module.scss'

type Props = ComponentProps<'dialog'> & {
	show: boolean
	onRequestClose: () => void
	children: React.ReactNode
	shouldCloseOnEsc?: boolean
}

const Modal = ({ show, onRequestClose, children, shouldCloseOnEsc = true, ...props }: Props) => {
	const [render, setRender] = useState(show)
	const ref = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		if (show) {
			setRender(true)
			setTimeout(() => ref.current?.showModal(), 0)
		} else if (ref.current?.open) {
			ref.current.classList.add(styles.isClosing)
			ref.current.onanimationend = () => {
				ref.current?.close()
				ref.current?.classList.remove(styles.isClosing)
				setRender(false)
			}
		}
	}, [show])

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

	if (!render) return null

	return (
		<dialog
			{...props}
			ref={ref}
			className={`${styles.modal} modal ${props.className||""}`}
			onCancel={(e) => { e.preventDefault(); onRequestClose() }}
			onClick={(e) => e.target === ref.current && onRequestClose()}
			nav-root={1}
		>
			{children}
		</dialog>
	)
}

export default Modal
