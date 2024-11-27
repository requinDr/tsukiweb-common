import styles from "../styles/title-menu-button.module.scss"
import classNames from "classnames";
import { Link, LinkProps, To } from "react-router-dom";

interface PropsButton extends React.ButtonHTMLAttributes<HTMLButtonElement> {
}
interface PropsLink extends LinkProps {
	to: To
}

type Props = {
	active?: boolean
	attention?: boolean
	[key: string]: any
} & (PropsButton | PropsLink)

const TitleMenuButton = ({to, attention, active, children, ...props}: Props) => {
  const classes = classNames(
		styles.menuItem,
		{
			[styles.attention]: attention,
			[styles.active]: active
		},
		"menu-item",
		props.className
	)

  const button = to ? (
		<Link
			{...props as LinkProps}
      className={classes}
			to={to}
		>
			{children}
      {attention && <Attention />}
		</Link>
	) : (
		<button
			{...props as React.ButtonHTMLAttributes<HTMLButtonElement>}
      className={classes}
		>
			{children}
      {attention && <Attention />}
		</button>
	)

  return button
}

export default TitleMenuButton

const Attention = () => <span> !</span>