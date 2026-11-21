import classNames from "classnames"
import { ReactNode } from "react"
import styles from "../styles/layouts.module.scss"
import PageTitle from "./PageTitle"

type Props = {
	title: ReactNode
	className?: string
	children?: ReactNode
}

const PageHeader = ({ title, className, children }: Props) => (
	<header className={classNames(styles.pageHeader, "page-header", className)}>
		<PageTitle>{title}</PageTitle>
		{children}
	</header>
)

export default PageHeader
