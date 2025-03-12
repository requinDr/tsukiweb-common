import { useCallback, useRef } from "react"
import TabsComponent, { Tab } from "../components/TabsComponent"
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
	const tabsRef = useRef<HTMLDivElement>(null);

	const handleSetSelectedTab = useCallback(
		(selected: any) => {
			setSelectedTab(selected);
			requestAnimationFrame(() => {
				const selectedTabElement = tabsRef.current?.querySelector(`[data-tab='${selected}']`)
				selectedTabElement?.scrollIntoView({ behavior: "smooth" })
			})
		},
		[setSelectedTab]
	)

	return (
		<div className={`${styles.pageContent} ${styles.pageTabsLayout}`} {...props} ref={tabsRef}>
			<main>
				{title &&
				<h2 className={`${styles.pageTitle} page-title`}>{title}</h2>
				}

				<TabsComponent
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