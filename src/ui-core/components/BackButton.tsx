import classNames from "classnames"
import { ButtonHTMLAttributes, ReactNode } from "react"
import { MdChevronLeft } from "react-icons/md"
import { AudioManager } from "../../audio/AudioManager"
import { useGameConfig } from "../../context"
import { useButtonSounds } from "../../hooks"
import styles from "../styles/back-button.module.scss"

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
	audio?: AudioManager
	keyHint?: ReactNode
	compact?: boolean
}

const BackButton = ({ audio, keyHint, compact = false, className, ...props }: Props) => {
	const { hints } = useGameConfig()
	const soundProps = useButtonSounds<HTMLButtonElement>(
		audio,
		props,
		{ hoverSound: 'tick', clickSound: 'glass' }
	)

	return (
		<button
			type="button"
			onContextMenu={e => e.preventDefault()}
			{...soundProps}
			className={classNames(styles.back, { [styles.compact]: compact }, className)}
		>
			<MdChevronLeft className={classNames(styles.icon, "back-button-icon")} aria-hidden />
			{keyHint && <kbd>{keyHint}</kbd>}
			{hints.back}
		</button>
	)
}

export default BackButton
