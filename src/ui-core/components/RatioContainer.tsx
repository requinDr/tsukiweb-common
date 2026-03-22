import { ViewRatio } from "../../constants"
import { useObserver } from "../../utils/Observer"
import { useRef } from "react"
import styles from "../styles/ratio.module.scss"

type Props = {
	obj: {
		fixedRatio: ViewRatio
	}
} & React.HTMLAttributes<HTMLDivElement>
const RatioContainer = ({obj, children, ...props}: Props) => {
	const ref = useRef<HTMLDivElement>(null)

	useObserver(ratio => {
		if (ratio == ViewRatio.unconstrained) {
			ref.current!.style.setProperty('--ratio', "initial")
		} else {
			ref.current!.style.setProperty('--ratio', `${ratio}`)
		}
	}, obj, "fixedRatio")

	return (
		<div ref={ref} className={styles["parent-container"]} {...props}>
			<div className={styles["ratio-container"]}>
				{children}
			</div>
		</div>
	)
}

export default RatioContainer