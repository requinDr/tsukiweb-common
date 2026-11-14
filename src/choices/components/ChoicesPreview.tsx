import { memo } from "react"
import classNames from "classnames"
import { bb } from "../../utils/Bbcode"
import { ChoiceItem } from "../types"
import styles from "../styles/choices.module.scss"

type Props = {
	choices: ChoiceItem[]
	className?: string
}

const ChoicesPreview = ({choices, className}: Props) => (
	<div className={classNames(styles.preview, className)}>
		{choices.map(({str}, i) =>
			<div key={i} className={styles.previewChoice}>
				<span className={styles.marker} />
				<span className={styles.text}>{bb(str)}</span>
			</div>
		)}
	</div>
)

export default memo(ChoicesPreview)
