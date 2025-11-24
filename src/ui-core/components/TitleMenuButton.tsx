import { FocusEventHandler, MouseEventHandler } from "react";
import { AudioManager } from "../../audio/AudioManager";
import styles from "../styles/title-menu-button.module.scss"
import classNames from "classnames";
import { Link, LinkProps } from "react-router";
import { eventNames } from "process";


type CommonProps = {
	active?: boolean
	attention?: boolean
	audio?: AudioManager
}

type ButtonProps = CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>
type LinkButtonProps = CommonProps & LinkProps

type Props = ButtonProps | LinkButtonProps

const TitleMenuButton = ({ active, attention, audio, children,
		onMouseEnter, onClick, onFocus, ...props}: Props) => {
	const classes = classNames(
		styles.menuItem,
		{
			[styles.attention]: attention,
			[styles.active]: active
		},
		"menu-item",
		props.className
	)
	let lastHover = 0

	if ("to" in props) return (
		<Link
			{...props}
			className={classes}
			to={props.to}
		>
			{children}
			{attention && <Attention />}
		</Link>
	)

	return (
		<button
			onMouseEnter={(evt)=> {
				const now = Date.now()
				if (now - lastHover > 200) { // 200ms delay
					audio?.playUiSound('tick')
					lastHover = now
				}
				(onMouseEnter as MouseEventHandler<HTMLButtonElement>)?.(evt)
			}}
			onMouseLeave={()=> {
				lastHover = Date.now()
			}}
			onFocus={(evt)=> {
				if (!evt.target.matches(':hover'))
					audio?.playUiSound('tick');
				(onFocus as FocusEventHandler<HTMLButtonElement>)?.(evt)
			}}
			onClick={(evt)=> {
				audio?.playUiSound('glass');
				(onClick as MouseEventHandler<HTMLButtonElement>)?.(evt)
			}}
			onContextMenu={e => e.preventDefault()}
			{...props}
			className={classes}
		>
			{children}
			{attention && <Attention />}
		</button>
	)
}

export default TitleMenuButton

const Attention = () => <span> !</span>