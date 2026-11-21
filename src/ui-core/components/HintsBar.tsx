import classNames from "classnames"
import { ReactNode } from "react"
import { MdGamepad } from "react-icons/md"
import { AudioManager } from "../../audio/AudioManager"
import { useGameConfig } from "../../context"
import { useInputDevice } from "../../hooks"
import BackButton from "./BackButton"
import styles from "../styles/hints-bar.module.scss"

type Props = {
	onBack: VoidFunction
	audio?: AudioManager
	className?: string
	children?: ReactNode
}

const HintsBar = ({ onBack, audio, className, children }: Props) => {
	const { hints } = useGameConfig()
	const gamepad = useInputDevice() === "gamepad"

	return (
		<footer className={classNames(styles.hintsBar, "hints-bar", className, {[styles.gamepad]: gamepad})}>
			<BackButton className={styles.hint} audio={audio} onClick={onBack}
				keyHint={gamepad ? "B" : "Esc"} />
			<span className={classNames(styles.hint, styles.keyHint)}>
				<kbd>{gamepad ? "A" : "Enter"}</kbd>{hints.confirm}
			</span>
			<span className={classNames(styles.hint, styles.keyHint)}>
				<kbd>{gamepad ? <MdGamepad /> : "↑↓←→"}</kbd>{hints.navigate}
			</span>
			{children && <div className={styles.extra}>{children}</div>}
		</footer>
	)
}

export default HintsBar
