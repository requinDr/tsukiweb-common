import { useReducer, useState } from "react"

export function useSetter<T>(setter: ()=>T): [T, VoidFunction];
export function useSetter<T, Args extends Array<any>>(setter: (...args: Args)=>T, ...initParams: Args) {
    const [value, setValue] = useState(()=>setter(...initParams))
    return [value, (...params: Args)=> { setValue(setter(...params)) }]
}