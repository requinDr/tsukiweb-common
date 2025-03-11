import React, { ReactNode, useCallback, useState } from "react"
import classNames from "classnames"
import Button from "./Button"
import ReactModal, { Styles } from "react-modal"
import styles from '../styles/modal.module.scss'
import { createRoot } from 'react-dom/client'
import { motion } from "motion/react"

type Props = {
	display: boolean
	text: ReactNode
	labelYes: string
	labelNo: string
	onYes: () => void
	onNo: () => void
	style?: Styles["content"]
}
const ModalPrompt = ({display, text, labelYes, labelNo, onYes, onNo, style}: Props) => {

	const handleYes = () => {
		onYes()
	}
	const handleNo = () => {
		onNo()
	}

	return (
		<ReactModal
			isOpen={display}
			shouldCloseOnOverlayClick={true}
			onRequestClose={handleNo}
			className={classNames(styles.prompt)}
			overlayClassName={classNames(`${styles.overlay} overlay`)}
			ariaHideApp={false}
			style={{content: style}}
		>
			<motion.div
				className={styles.promptModal}
				initial={{ translateY: "-1em", opacity: 0 }}
				animate={{ translateY: 0, opacity: 1 }}
			>
				<div className={styles.body}>
					{text}
				</div>

				<div className={styles.buttons}>
					<Button onClick={handleYes}>{labelYes}</Button>
					{labelNo && (
						<>
							<div className={styles.separator} />
							<Button onClick={handleNo}>{labelNo}</Button>
						</>
					)}
				</div>
			</motion.div>
		</ReactModal>
	)
}

export default ModalPrompt



// Types
type ConfirmOptions = {
	text: React.ReactNode
	labelYes: string
	labelNo: string
	color?: string
}

type AlertOptions = {
	text: React.ReactNode
	labelOk: string
	color?: string
}

type ModalState = {
	isOpen: boolean
	type: 'confirm' | 'alert'
	options: ConfirmOptions | AlertOptions | null
	resolve: ((value: boolean) => void) | null
}

// Container and root reference
let modalContainer: HTMLDivElement | null = null
let rootInstance: any = null

// Initialize the modal container
const initializeModalContainer = () => {
	if (typeof document !== 'undefined') {
		if (!modalContainer) {
			modalContainer = document.createElement('div')
			modalContainer.id = 'modal-prompt-container'
			document.body.appendChild(modalContainer)
			rootInstance = createRoot(modalContainer)
		}
		return { container: modalContainer, root: rootInstance }
	}
	return { container: null, root: null }
}

// The modal manager component
const ModalManager: React.FC = () => {
	const [modalState, setModalState] = useState<ModalState>({
		isOpen: false,
		type: 'confirm',
		options: null,
		resolve: null,
	})

	const handleYes = useCallback(() => {
		setModalState((prev) => ({ ...prev, isOpen: false }))
		modalState.resolve?.(true)
	}, [modalState.resolve])

	const handleNo = useCallback(() => {
		setModalState((prev) => ({ ...prev, isOpen: false }))
		modalState.resolve?.(false)
	}, [modalState.resolve])

	const handleOk = useCallback(() => {
		setModalState((prev) => ({ ...prev, isOpen: false }))
		modalState.resolve?.(true)
	}, [modalState.resolve])

	// Expose the methods to the window
	React.useEffect(() => {
		// @ts-ignore
		window.modalPrompt = {
			confirm: (options: ConfirmOptions): Promise<boolean> => {
				return new Promise<boolean>((resolve) => {
					setModalState({
						isOpen: true,
						type: 'confirm',
						options,
						resolve,
					})
				})
			},
			alert: (options: AlertOptions): Promise<void> => {
				return new Promise<void>((resolve) => {
					setModalState({
						isOpen: true,
						type: 'alert',
						options,
						resolve: () => {
							resolve()
							return true
						},
					})
				})
			},
		}

		return () => {
			// @ts-ignore
			delete window.modalPrompt
		}
	}, [])

	// Create style object if color is provided
	const promptStyle = modalState.options?.color 
		? { '--prompt-color': modalState.options.color } as React.CSSProperties
		: undefined

	if (!modalState.options || !modalState.isOpen) {
		return null
	}

	// For alert type, we only show the "Ok" button
	if (modalState.type === 'alert') {
		const alertOptions = modalState.options as AlertOptions
		return (
			<ModalPrompt
				display={modalState.isOpen}
				text={alertOptions.text}
				labelYes={alertOptions.labelOk}
				labelNo="" // Empty string to hide the "No" button
				onYes={handleOk}
				onNo={() => {}} // Empty function since we don't use it
				style={promptStyle}
			/>
		)
	}

	// For confirm type, we show both "Yes" and "No" buttons
	const confirmOptions = modalState.options as ConfirmOptions
	return (
		<ModalPrompt
			display={modalState.isOpen}
			text={confirmOptions.text}
			labelYes={confirmOptions.labelYes}
			labelNo={confirmOptions.labelNo}
			onYes={handleYes}
			onNo={handleNo}
			style={promptStyle}
		/>
	)
}

// Function to mount the modal manager
export const mountModalManager = (): void => {
	const { root } = initializeModalContainer()
	if (root) {
		root.render(<ModalManager />)
	}
}

// Define the global interface
declare global {
	interface Window {
		modalPrompt: {
			confirm: (options: ConfirmOptions) => Promise<boolean>
			alert: (options: AlertOptions) => Promise<void>
		}
	}
}

// Modal service to be imported and used anywhere
export const modalPromptService = {
	confirm: (options: ConfirmOptions): Promise<boolean> => {
		if (typeof window === 'undefined') {
			return Promise.resolve(false)
		}

		// Make sure the modal manager is mounted
		if (!rootInstance) {
			mountModalManager()
		}

		// Call the confirm method from the window object
		return window.modalPrompt.confirm(options)
	},
	alert: (options: AlertOptions): Promise<void> => {
		if (typeof window === 'undefined') {
			return Promise.resolve()
		}

		// Make sure the modal manager is mounted
		if (!rootInstance) {
			mountModalManager()
		}

		// Call the alert method from the window object
		return window.modalPrompt.alert(options)
	}
}

export const useModalPrompt = () => {
	return modalPromptService
}