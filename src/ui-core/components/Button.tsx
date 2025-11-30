import { Link, LinkProps } from "react-router"
import styles from "../styles/button.module.scss"
import classNames from "classnames"
import useButtonSounds from "../../hooks/useButtonSounds"
import { AudioManager } from "../../audio/AudioManager"
import { NavigationProps } from "../../input/arrowNavigation"
import { WithRequired } from "../../types"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>
type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement>

type Props = {
	variant?: "default" | "corner" | "elevation" | "underline-left" | null
	active?: boolean
	[key: string]: any
} & ({
	audio: AudioManager
	hoverSound?: string
	clickSound?: string
} | {}) & (
	ButtonProps |
	WithRequired<LinkProps, 'to'> |
	WithRequired<AnchorProps, 'href'>
) & NavigationProps

const Button = ({children, to, href, className, variant = "default",
				 active = false, audio, hoverSound, clickSound, ...props}: Props) => {
	
	const classes = classNames(styles.btn, "btn", {
		[styles.btnVariantDefault]: variant === "default",
		[styles.btnVariantCorner]: variant === "corner",
		[styles.btnVariantElevation]: variant === "elevation",
		[styles.btnVariantUnderlineLeft]: variant === "underline-left",
		[styles.active]: active,
	}, className)

	if (hoverSound || clickSound)
		props = useButtonSounds(audio, props as any, {hoverSound, clickSound})

	if (to) {
		return (
			<Link className={classes} {...(props as LinkProps)} to={to}>
				{children}
			</Link>
		)
	}

	if (href) {
		return (
			<a className={classes} {...(props as AnchorProps)} href={href}>
				{children}
			</a>
		)
	}

	return (
		<button className={classes} onContextMenu={(e) => e.preventDefault()}
				{...(props as ButtonProps)}>
			{children}
		</button>
	)
}

export default Button