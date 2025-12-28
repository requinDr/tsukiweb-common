import ReactModal from "react-modal";
import styles from '../styles/modal.module.scss';

type Props = {
	show: boolean
	onRequestClose: () => void
	children: React.ReactNode
	className?: string
}
const Modal = ({ show, onRequestClose, children, className }: Props) => {

	return (
		<ReactModal
			isOpen={show}
			shouldCloseOnOverlayClick={true}
			onRequestClose={onRequestClose}
			closeTimeoutMS={200}
			className={`${styles.modal} modal ${className||""}`}
			overlayClassName={`${styles.overlay} overlay`}
			ariaHideApp={false}
			contentElement={(props, children) =>
				<div {...props} nav-root={1}>{children}</div>
			}
		>
			{children}
		</ReactModal>
	)
}

export default Modal