import { Dispatch, SetStateAction } from "react"
import styles from "../styles/tabs.module.scss"
import classNames from "classnames"
import { AudioManager } from "../../audio/AudioManager"
import { useButtonSounds } from "../../hooks"

export type Tab = {
	label: string,
	value: string
	disabled?: boolean
	audio?: AudioManager
}


type TabsProps = {
	tabs: Tab[],
	selected: string,
	setSelected: Dispatch<SetStateAction<any>>
}
const TabsBar = ({ tabs, selected, setSelected }: TabsProps) => (
	<div className={classNames(styles.tabs, "tabs")}>
		{tabs.map(tab =>
			<TabBtn key={tab.value}
				active={selected === tab.value}
				onClick={() => setSelected(tab.value)}
				nav-auto={1}
				{...tab}
			/>
		)}
	</div>
)

export default TabsBar


type TabBtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	label: string,
	value: string,
	active: boolean,
	audio?: AudioManager
}
const TabBtn = ({label, value, active, audio, ...props}: TabBtnProps) => {
	const soundProps = useButtonSounds<HTMLButtonElement>(
		audio,
		props,
		{ clickSound: 'glass' }
	)

	return (
		<button
			className={classNames(styles.tab, "tab", { [styles.active]: active }, props?.className)}
			onContextMenu={e => e.preventDefault()}
			data-tab={value}
			{...soundProps}
		 >
			{label}
		</button>
	)
}