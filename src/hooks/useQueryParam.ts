import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hook to manage a query parameter
 * @param paramName - The name of the query parameter
 * @param initialValue - The initial value of the query parameter
 * @returns A tuple with the current value of the query parameter and a function to update it
 */
function useQueryParam<T>(paramName: string, initialValue: T): [T, (newValue: T) => void] {
	const [searchParams, setSearchParams] = useSearchParams()

	const value = useMemo(() => {
		const paramValue = searchParams.get(paramName)
		return paramValue !== null ? (paramValue as unknown as T) : initialValue
	}, [searchParams, paramName, initialValue])

	const updateValue = (newValue: T) => {
		setSearchParams(prevSearchParams => {
			const newSearchParams = new URLSearchParams(prevSearchParams);
			newSearchParams.set(paramName, String(newValue));
			return newSearchParams;
		})
	}

	return [value, updateValue]
}

export default useQueryParam;
