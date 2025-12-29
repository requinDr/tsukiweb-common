
import { Activity, RefAttributes, useCallback, useRef, useState } from "react"
import { DivProps } from "../../types"

type Props = DivProps & RefAttributes<HTMLDivElement> & {
	show: boolean
	hideProps?: DivProps
	showProps?: DivProps
}

export const AnimatedHideActivityDiv = ({show, showProps, hideProps, children, onTransitionEnd, ...props}: Props)=> {
	const [prevShow, setPrevShow] = useState(show)
	const [visible, setVisible] = useState(show)
	const divRef = useRef<HTMLDivElement>(null)

	let activeShow = show
	if (show !== prevShow) {
		setPrevShow(show)
		if (show && !visible) {
			requestAnimationFrame(() => setVisible(true))
			activeShow = false 
		}
	}

	const handleTransitionEnd = useCallback((evt: React.TransitionEvent<HTMLDivElement>) => {
		onTransitionEnd?.(evt)
		if (evt.target === divRef.current && !show) setVisible(false)
	}, [show, onTransitionEnd])

	const extraProps = activeShow && visible ? showProps : hideProps
	const className = [props?.className, extraProps?.className].filter(Boolean).join(' ')

	return (
		<div 
			ref={divRef}
			{...props}
			{...extraProps}
			className={className}
			onTransitionEnd={handleTransitionEnd}
		>
			<Activity mode={(show || visible) ? "visible" : "hidden"}>
				{children}
			</Activity>
		</div>
	)
}
export default AnimatedHideActivityDiv