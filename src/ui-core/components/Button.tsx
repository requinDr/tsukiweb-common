import { Link, LinkProps, To } from "react-router"
import styles from "../styles/button.module.scss"
import classNames from "classnames"


/**
 * A button or Link already styled
 */
interface PropsButton extends React.ButtonHTMLAttributes<HTMLButtonElement> {
}
interface PropsLink extends LinkProps {
	to: To
}
interface PropsAnchor extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
	href: string
}

type Props = {
	variant?: "default" | "corner" | "menu"
	active?: boolean
	className?: string
	[key: string]: any
} & (PropsButton | PropsLink | PropsAnchor)
const Button = ({children, to, href, className, variant = "default", active = false, ...props}: Props) => {
	const classes = classNames(styles.btn, "btn", {
		[styles.btnVariantDefault]: variant === "default",
		[styles.btnVariantCorner]: variant === "corner",
		[styles.btnVariantMenu]: variant === "menu",
		[styles.active]: active,
		[className || ""]: className
	})

	if (to) {
		return (
			<Link className={classes} {...(props as LinkProps)} to={to}>
				{children}
			</Link>
		)
	}

	if (href) {
		return (
			<a className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)} href={href}>
				{children}
			</a>
		)
	}

	return (
		<button className={classes} onContextMenu={(e) => e.preventDefault()} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
			{children}
		</button>
	)
}

export default Button