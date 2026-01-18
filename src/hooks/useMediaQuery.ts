import { useState, useEffect } from 'react'

/**
 * A custom hook that tracks the state of a CSS media query.
 * 
 * @param query The media query string to monitor (e.g., "(min-width: 768px)")
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState<boolean>(() => {
		if (typeof window !== 'undefined') {
			return window.matchMedia(query).matches
		}
		return false
	})

	useEffect(() => {
		const mediaQueryList = window.matchMedia(query)
		
		const handleChange = (event: MediaQueryListEvent) => {
			setMatches(event.matches)
		}

		mediaQueryList.addEventListener("change", handleChange)
		setMatches(mediaQueryList.matches)

		return () => {
			mediaQueryList.removeEventListener("change", handleChange)
		}
	}, [query])

	return matches
}