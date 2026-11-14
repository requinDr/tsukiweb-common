import { memo } from "react"
import classNames from "classnames"
import * as m from "motion/react-m"
import { AnimatePresence, Variants } from "motion/react"
import { Bbcode } from "../../utils/Bbcode"
import Button from "../../ui-core/components/Button"
import { AudioManager } from "../../audio/AudioManager"
import { ChoiceItem } from "../types"
import styles from "../styles/choices.module.scss"

const backdrop: Variants = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: {
			duration: 0.25,
			ease: "easeOut",
			when: "beforeChildren",
			staggerChildren: 0.07,
		}
	},
	leave: {
		opacity: 0,
		pointerEvents: "none",
		transition: {
			duration: 0.2,
			ease: "easeOut",
		}
	}
}

const item: Variants = {
	hidden: { opacity: 0, x: -28 },
	show: {
		opacity: 1,
		x: 0,
		transition: {
			duration: 0.35,
			ease: [0.22, 1, 0.36, 1]
		}
	}
}

type Props<T extends ChoiceItem> = {
	show: boolean
	choices: T[]
	question?: string
	onSelect: (choice: T) => void
	navigable?: boolean
	audio: AudioManager
	id?: string
	className?: string
}

const ChoicesMenu = <T extends ChoiceItem>({show, choices, question, onSelect,
		navigable = false, audio, id, className}: Props<T>) => (
	<AnimatePresence>
		{show && (
			<m.div id={id} className={classNames(styles.menu, className)}
				variants={backdrop} initial="hidden" animate="show" exit="leave">
				<div className={styles.container}>
					{question &&
						<m.div className={styles.question} variants={item}>
							<span><Bbcode text={question}/></span>
						</m.div>
					}
					<ul className={styles.list}>
						{choices.map((choice, i) =>
							<m.li key={i} className={styles.item} variants={item}>
								<Button
									disabled={choice.disable ?? false}
									variant={null}
									className={styles.choice}
									onClick={() => onSelect(choice)}
									audio={audio}
									hoverSound="tick"
									clickSound="impact"
									//i-0.5 to place cursor on second choice when pressing down
									{...(navigable && {'nav-y': i-0.5})}
								>
									<span className={styles.marker} aria-hidden="true" />
									<span className={styles.text}>
										<Bbcode text={choice.str} />
									</span>
								</Button>
							</m.li>
						)}
					</ul>
				</div>
			</m.div>
		)}
	</AnimatePresence>
)

export default memo(ChoicesMenu) as typeof ChoicesMenu
