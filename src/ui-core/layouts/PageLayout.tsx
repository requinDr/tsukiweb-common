import classNames from "classnames"
import { ReactNode } from "react"
import { useNavBackRef } from "../../hooks"
import { DivProps } from "../../types"
import styles from "../styles/layouts.module.scss"
import PageTitle from "./PageTitle"

type BaseProps = Omit<DivProps, "title"> & {
	title: ReactNode
	actions: ReactNode
	onBack: VoidFunction
	children: ReactNode
}

type Props = BaseProps & (
	| {
		variant: "tabs"
		navigation: ReactNode
		secondary?: never
	}
	| {
		variant: "master-detail"
		secondary: ReactNode
		navigation?: never
	}
)

const PageLayout = ({
	title,
	variant,
	navigation,
	secondary,
	actions,
	onBack,
	children,
	className,
	...props
}: Props) => (
	<div
		{...props}
		className={classNames(styles.pageContent, styles.pageLayout, {
			[styles.tabsLayout]: variant === "tabs",
			[styles.masterDetailLayout]: variant === "master-detail",
		}, className)}
		ref={useNavBackRef(onBack)}
	>
		<PageTitle>{title}</PageTitle>
		{navigation && <div className={styles.navigation}>{navigation}</div>}
		<div className={styles.content}>{children}</div>
		{secondary && <div className={styles.secondary}>{secondary}</div>}
		<div className={styles.actions}>{actions}</div>
	</div>
)

export default PageLayout