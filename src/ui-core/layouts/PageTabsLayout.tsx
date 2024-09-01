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

	return (
		<div className={`${styles.pageContent} ${styles.pageTabsLayout}`} {...props}>
			<main>
				{title &&
				<h2 className={styles.pageTitle}>{title}</h2>
				}

				<TabsComponent
					tabs={tabs}
					selected={selectedTab}
					setSelected={setSelectedTab}
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