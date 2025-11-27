import { AudioManager } from "../../audio/AudioManager";
import styles from "../styles/title-menu-button.module.scss"
import classNames from "classnames";
import useButtonSounds from "../../hooks/useButtonSounds";

type TitleMenuButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &{
	active?: boolean
	attention?: boolean
	audio?: AudioManager
}

const TitleMenuButton = ({ active, attention, audio, children, ...props}: TitleMenuButtonProps) => {
	const classes = classNames(
		styles.menuItem,
		{
			[styles.attention]: attention,
			[styles.active]: active
		},
		"menu-item",
		props.className
	)

	const soundProps = useButtonSounds<HTMLButtonElement>(
		audio,
		props,
		{ hoverSound: 'tick', clickSound: 'glass' }
	)

	return (
		<button
			onContextMenu={e => e.preventDefault()}
			{...soundProps}
			className={classes}
		>
			{children}
			{attention && <Attention />}
		</button>
	)
}

export default TitleMenuButton

const Attention = () => <span> !</span>
