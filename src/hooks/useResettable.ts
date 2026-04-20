import { useState, useRef } from "react"

export function useResettable<T>(factory: () => T): [T, () => void] {
  const ref = useRef<T>(undefined)
  if (!ref.current) ref.current = factory()

  const [value, setValue] = useState(ref.current)

  return [value, () => setValue((ref.current = factory()))]
}