import { useCallback, useRef } from "react"
import TabsBar, { Tab } from "../components/TabsBar"
import PageTitle from "./PageTitle"
import styles from "../styles/layouts.module.scss"

type Props = {
	title?: string
	tabs: Tab[]
	selectedTab: string
	setSelectedTab: (selected: any) => void
	children: any
	backButton?: any
	[key: string]: any
}
const PageTabsLayout = ({
	title,
	tabs,
	selectedTab,
	setSelectedTab,
	children,
	backButton,
	...props
}: Props) => {
	const tabsRef = useRef<HTMLDivElement>(null)

	const handleSetSelectedTab = useCallback(
		(selected: any) => {
			setSelectedTab(selected)
			requestAnimationFrame(() => {
				const selectedTabElement = tabsRef.current?.querySelector(`[data-tab='${selected}']`)
				selectedTabElement?.scrollIntoView({ behavior: "smooth" })
			})
		},
		[setSelectedTab]
	)

	return (
		<div {...props} className={`${styles.pageContent} ${styles.pageTabsLayout}`} ref={tabsRef}>
			<main>
				{title &&
				<PageTitle>{title}</PageTitle>
				}

				<TabsBar
					tabs={tabs}
					selected={selectedTab}
					setSelected={handleSetSelectedTab}
				/>

				<div className={styles.content}>
					{children}
				</div>

				{backButton &&
				<div className={styles.backButton}>
					{backButton}
				</div>
				}
			</main>
		</div>
	)
}

export default PageTabsLayout