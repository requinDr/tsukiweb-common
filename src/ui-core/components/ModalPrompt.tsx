import { ComponentProps, ReactNode, useEffect, useState } from "react"
import classNames from "classnames"
import Button from "./Button"
import styles from '../styles/modal.module.scss'
import { createRoot, Root } from 'react-dom/client'
import Modal from "./Modal"


type Props = {
	display: boolean
	text: ReactNode
	labelYes: string
	labelNo?: string
	onYes: () => void
	onNo: () => void
	style?: ComponentProps<typeof Modal>['style']
}
const ModalPrompt = ({display, text, labelYes, labelNo, onYes, onNo, style}: Props) => {

	return (
		<Modal
			show={display}
			onRequestClose={onNo}
			className={classNames(styles.prompt)}
			style={style}
		>
			<div className={styles.body}>
				{text}
			</div>

			<div className={styles.buttons}>
				<Button onClick={onYes} nav-auto={1}>{labelYes}</Button>
				{labelNo && (<>
					<div className={styles.separator} />
					<Button onClick={onNo} nav-auto={1}>{labelNo}</Button>
				</>)}
			</div>
		</Modal>
	)
}

export default ModalPrompt


type DialogOptions = {
	text: ReactNode
	labelYes: string
	labelNo?: string
	color?: string
	resolve: (val: any) => void
}
let openDialog: (options: DialogOptions) => void
const DialogManager = () => {
	const [state, setState] = useState<DialogOptions | null>(null)

	useEffect(() => {
		openDialog = (options) => setState(options)
	}, [])

	if (!state) return null

	const close = (value: any) => {
		setState(null)
		state.resolve(value)
	}

	return (
		<ModalPrompt
			display={!!state}
			text={state.text}
			labelYes={state.labelYes}
			labelNo={state.labelNo}
			onYes={() => close(true)}
			onNo={() => close(false)}
			style={state.color ? { '--prompt-color': state.color } as any : undefined}
		/>
	)
}

let rootInstance: Root | null = null

export const mountDialogManager = () => {
	if (typeof document !== 'undefined' && !rootInstance) {
		const container = document.createElement('div')
		rootInstance = createRoot(container)
		rootInstance.render(<DialogManager />)
	}
}

export const dialog = {
	confirm: (opts: Omit<DialogOptions, 'resolve'>): Promise<boolean> => {
		mountDialogManager()
		return new Promise(r => openDialog?.({ ...opts, resolve: r }))
	},
	alert: (opts: { text: ReactNode, labelOk: string, color?: string }): Promise<void> => {
		mountDialogManager()
		return new Promise(r => openDialog?.({ 
			text: opts.text, 
			labelYes: opts.labelOk, 
			color: opts.color, 
			resolve: r 
		}))
	}
}