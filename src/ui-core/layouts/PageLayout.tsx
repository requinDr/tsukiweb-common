import classNames from "classnames"
import { ReactNode } from "react"
import { AudioManager } from "../../audio/AudioManager"
import { useNavBackRef } from "../../hooks"
import { DivProps } from "../../types"
import HintsBar from "../components/HintsBar"
import styles from "../styles/layouts.module.scss"
import PageHeader from "./PageHeader"

type BaseProps = Omit<DivProps, "title"> & {
	title: ReactNode
	actions?: ReactNode
	onBack: VoidFunction
	audio?: AudioManager
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
	audio,
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
		<PageHeader title={title}>
			{navigation && <div className={styles.navigation}>{navigation}</div>}
		</PageHeader>
		<div className={styles.content}>{children}</div>
		{secondary && <div className={styles.secondary}>{secondary}</div>}
		<HintsBar onBack={onBack} audio={audio} className={styles.actions}>{actions}</HintsBar>
	</div>
)

export default PageLayout