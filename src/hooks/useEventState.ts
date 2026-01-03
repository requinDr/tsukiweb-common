import { useCallback, useEffect, useRef, useState } from "react";

type Callback = (...args: any)=>void

interface EvtTarget<E extends string = string> {
    addEventListener(evt: E, callback: Callback, opts?: any): any;
    removeEventListener(evt: E, callback: Callback, opts?: any): any;
}
type Evt<T extends EvtTarget> = Parameters<T['addEventListener']>[0]
type Opts<T extends EvtTarget> = Parameters<T['addEventListener']>[2]

export function useEventState<T extends EvtTarget>(target: T,
        enterEvt: Evt<T> | Array<Evt<T>>, exitEvt: Evt<T> | Array<Evt<T>>,
        enterOpts?: Opts<T>, exitOpts?: Opts<T>) {
	const [status, setStatus] = useState<boolean>(false)

    useEffect(()=> {
        const onEnter = setStatus.bind(undefined, true)
        const onExit = setStatus.bind(undefined, false)
        const add = target.addEventListener.bind(target)
        const remove = target.removeEventListener.bind(target)

        if (typeof enterEvt == "string") add(enterEvt, onEnter, enterOpts)
        else enterEvt.forEach(e => add(e, onEnter, enterOpts))

        if (typeof exitEvt == "string") add(exitEvt, onExit, exitOpts)
        else exitEvt.forEach(e => add(e, onExit, enterOpts))

        return ()=> {
            if (typeof enterEvt == "string") remove(enterEvt, onEnter, enterOpts)
            else enterEvt.forEach(e => remove(e, onEnter, enterOpts))
            
            if (typeof exitEvt == "string") remove(exitEvt, onExit, exitOpts)
            else exitEvt.forEach(e => remove(e, onExit, enterOpts))
        }
    }, [target, enterEvt, exitEvt])
	return [status, setStatus] as const
}

export default useEventState