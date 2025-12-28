
import { Activity, RefAttributes, useCallback, useRef, useState } from "react"
import { DivProps } from "../../types"

type P = DivProps & {
    [x: `${string}-${string}`]: any
}

type Props = P & RefAttributes<HTMLDivElement> & {
    show: boolean
    hideProps?: P
    showProps?: P
} & ( { showProps: P }
    | { hideProps: P }
)

export const AnimatedHideActivityDiv = ({show, showProps, hideProps, children, onTransitionEnd, ...props}: Props)=> {
    let [visible, setVisible] = useState<boolean>(show)
    const divRef = useRef<HTMLDivElement>(null)

    const transitionEndHandler = useCallback((evt: any)=> {
        onTransitionEnd?.(evt)
        if (evt.target == divRef.current) {
            setVisible(show)
        }
    }, [props.onAnimationEnd])

    if (show && !visible) {
        // change activity mode before changing the properties
        requestAnimationFrame(setVisible.bind(undefined, show))
        show = false
        visible = true
    }
    if (show) {
        if (showProps) {
            const className = [props.className, showProps.className].filter((c)=>c).join(' ')
            props = {...props, ...showProps, className}
        }
    } else {
        const className = [props.className, hideProps?.className].filter((c)=>c).join(' ')
        props = {
            ...props,
            className,
            onTransitionEnd: transitionEndHandler
        } as Props
    }
    return (
        <div ref={divRef} {...props}>
            <Activity mode={visible || show ? "visible" : "hidden"}>
                {children}
            </Activity>
        </div>
    )
}
export default AnimatedHideActivityDiv