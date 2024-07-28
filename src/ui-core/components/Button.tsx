import { Link, LinkProps, To } from "react-router-dom"
import styles from "../styles/button.module.scss"
import classNames from "classnames"

interface PropsButton extends React.ButtonHTMLAttributes<HTMLButtonElement> {
}
interface PropsLink extends LinkProps {
	to: To
}

type Props = {
	variant?: "default" | "corner" | "menu"
	active?: boolean
	className?: string
	[key: string]: any
} & (PropsButton | PropsLink)

/**
 * A button or Link already styled
 */
const Button = ({children, to, className, variant = "default", active = false, ...props}: Props) => {
	const classes = classNames(styles.btn, "btn", {
		[styles.btnVariantDefault]: variant === "default",
		[styles.btnVariantCorner]: variant === "corner",
		[styles.btnVariantMenu]: variant === "menu",
		[styles.active]: active,
		[className || ""]: className
	})

	const button = to ? (
		<Link
			className={classes}
			{...props as LinkProps}
			to={to}
		>
			{children}
		</Link>
	) : (
		<button
			className={classes}
			{...props as React.ButtonHTMLAttributes<HTMLButtonElement>}
		>
			{children}
		</button>
	)
	return button
}

export default Button