import { Dispatch, SetStateAction, useLayoutEffect, useRef, useState } from "react"
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
const TabsBar = ({ tabs, selected, setSelected }: TabsProps) => {
	const tabsRef = useRef<HTMLDivElement>(null)
	const [overflow, setOverflow] = useState({ before: false, after: false })

	const updateOverflow = (element: HTMLDivElement) => {
		const next = {
			before: element.scrollLeft > 1,
			after: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
		}
		setOverflow(current =>
			current.before === next.before && current.after === next.after ? current : next
		)
	}

	useLayoutEffect(() => {
		const element = tabsRef.current
		if (!element) return

		const observer = new ResizeObserver(() => updateOverflow(element))
		observer.observe(element)
		Array.from(element.children).forEach(child => observer.observe(child))
		updateOverflow(element)

		return () => observer.disconnect()
	}, [tabs.length])

	return (
		<div
			className={classNames(styles.tabsViewport, "tabs-viewport")}
			data-overflow-before={overflow.before || undefined}
			data-overflow-after={overflow.after || undefined}
		>
			<div
				className={classNames(styles.tabs, "tabs")}
				ref={tabsRef}
				role="tablist"
				onScroll={event => updateOverflow(event.currentTarget)}
			>
				{tabs.map(tab =>
					<TabBtn key={tab.value}
						active={selected === tab.value}
						onClick={() => setSelected(tab.value)}
						nav-auto={1}
						{...tab}
					/>
				)}
			</div>
		</div>
	)
}

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
			role="tab"
			aria-selected={active}
			data-tab={value}
			{...soundProps}
		 >
			{label}
		</button>
	)
}