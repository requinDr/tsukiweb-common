import classNames from "classnames"
import { MdChevronLeft, MdChevronRight } from "react-icons/md"
import { AudioManager } from "../../audio/AudioManager"
import { useButtonSounds } from "../../hooks"
import styles from "../styles/page-switcher.module.scss"

export type SwitcherPage = {
	value: string
	label: string
	attention?: boolean
	locked?: boolean
}

type Props = {
	pages: SwitcherPage[]
	selected: string
	onSelect: (value: string) => void
	audio?: AudioManager
	className?: string
}

const PageSwitcher = ({ pages, selected, onSelect, audio, className }: Props) => {
	const index = Math.max(0, pages.findIndex(({ value }) => value === selected))
	const page = pages[index]
	const go = (delta: number) => {
		for (let i = 1; i < pages.length; i++) {
			const target = pages[(index + delta * i + pages.length * i) % pages.length]
			if (!target.locked)
				return onSelect(target.value)
		}
	}
	const hasAttention = (from: number, to: number) =>
		pages.slice(from, to).some(({ attention }) => attention)

	return (
		<nav className={classNames(styles.switcher, "page-switcher", className)}>
			<SwitchArrow audio={audio} attention={hasAttention(0, index)}
				onClick={() => go(-1)} aria-label="previous">
				<MdChevronLeft />
			</SwitchArrow>
			<div className={styles.current}>
				<span key={page?.value}
					className={classNames(styles.label, {[styles.attention]: page?.attention})}>
					{page?.label}
				</span>
				<div className={styles.pips}>
					{pages.map(({ value, label, attention, locked }) =>
						<button key={value} type="button"
							className={classNames(styles.pip, {
								[styles.active]: value === selected,
								[styles.attention]: attention,
							})}
							aria-label={label}
							aria-current={value === selected}
							disabled={locked}
							onClick={() => onSelect(value)}
						/>
					)}
				</div>
			</div>
			<SwitchArrow audio={audio} attention={hasAttention(index + 1, pages.length)}
				onClick={() => go(1)} aria-label="next">
				<MdChevronRight />
			</SwitchArrow>
		</nav>
	)
}

export default PageSwitcher

type ArrowProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	audio?: AudioManager
	attention?: boolean
	locked?: boolean
}

const SwitchArrow = ({ audio, attention, children, ...props }: ArrowProps) => {
	const soundProps = useButtonSounds<HTMLButtonElement>(
		audio,
		props,
		{ hoverSound: 'tick', clickSound: 'glass' }
	)

	return (
		<button
			type="button"
			nav-auto={1}
			{...soundProps}
			className={classNames(styles.arrow, {[styles.attention]: attention})}
		>
			{children}
		</button>
	)
}
