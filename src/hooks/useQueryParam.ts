import { useCallback, useRef } from 'react'
import { useSearch } from 'wouter'

/**
 * Hook to manage a query parameter
 * @param paramName - The name of the query parameter
 * @param initialValue - The initial value of the query parameter
 * @returns A tuple with the current value of the query parameter and a function to update it
 */
export function useQueryParam<T>(paramName: string, initialValue: T): [T, (newValue: T) => void] {
	const search = useSearch()
	const lastValueRef = useRef<T>(initialValue)
	
	const searchParams = new URLSearchParams(search)
	const paramValue = searchParams.get(paramName)
	if (paramValue !== null) {
		lastValueRef.current = paramValue as unknown as T
	}

	const updateValue = useCallback((newValue: T) => {
		lastValueRef.current = newValue
		const searchParams = new URLSearchParams(window.location.search)
		searchParams.set(paramName, String(newValue))
		const newUrl = `${window.location.pathname}?${searchParams.toString()}`
		history.replaceState(null, '', newUrl)
		window.dispatchEvent(new PopStateEvent('popstate'))
	}, [paramName])

	return [lastValueRef.current, updateValue]
}