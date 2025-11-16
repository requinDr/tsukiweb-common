import styles from "../styles/title-menu-button.module.scss"
import classNames from "classnames";
import { Link, LinkProps } from "react-router";


type CommonProps = {
	active?: boolean
	attention?: boolean
}

type ButtonProps = CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>
type LinkButtonProps = CommonProps & LinkProps

type Props = ButtonProps | LinkButtonProps

const TitleMenuButton = ({ active, attention, children, ...props}: Props) => {
	const classes = classNames(
		styles.menuItem,
		{
			[styles.attention]: attention,
			[styles.active]: active
		},
		"menu-item",
		props.className
	)

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