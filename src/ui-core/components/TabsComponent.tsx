import { Dispatch, SetStateAction } from "react"
import styles from "../styles/tabs.module.scss"
import classNames from "classnames"

export type Tab = {
	label: string,
	value: string
	disabled?: boolean
}


/**
 * Tabs with a default style applied
 */
type TabsProps = {
	tabs: Tab[],
	selected: string,
	setSelected: Dispatch<SetStateAction<any>>
}
const TabsComponent = ({ tabs, selected, setSelected }: TabsProps) => (
	<div className={classNames(styles.tabs, "tabs")}>
		{tabs.map(tab =>
			<TabBtn key={tab.value}
				text={tab.label}
				value={tab.value}
				active={selected === tab.value}
				onClick={() => setSelected(tab.value)}
				buttonProps={{
					disabled: tab.disabled
				}}
			/>
		)}
	</div>
)

export default TabsComponent


type TabBtnProps = {
	text: string,
	value: string,
	active: boolean,
	onClick: ()=> void
	buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
}
const TabBtn = ({text, value, active, onClick, buttonProps}: TabBtnProps) => (
	<button
		className={classNames(styles.tab, "tab", { [styles.active]: active }, buttonProps?.className)}
		onClick={onClick}
		onContextMenu={e => e.preventDefault()}
		data-tab={value}
		{...buttonProps}
	 >
		{text}
	</button>
)