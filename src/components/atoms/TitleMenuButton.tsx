import classNames from "classnames";
import { Link, LinkProps, To } from "react-router-dom";

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

const TitleMenuButton = ({
	to,
	attention,
	children,
	...props
}: Props) => {
	const Attention = () => <span> !</span>

  const classes = classNames("menu-item", {"attention": attention}, props.className)

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