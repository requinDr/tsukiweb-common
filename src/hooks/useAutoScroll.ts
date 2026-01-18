import { useEffect, useRef } from 'react'

/**
 * Auto-scroll the parent element to the bottom when the content changes size.
 * @returns a ref to be attached to the content element.
 */
export const useAutoScroll = () => {
	const contentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const content = contentRef.current
		const scrollParent = content?.parentElement

		if (!content || !scrollParent) return

		const observer = new ResizeObserver(() => {
			scrollParent.scrollTo({
				top: scrollParent.scrollHeight,
				behavior: 'smooth'
			})
		})

		observer.observe(content)
		return () => observer.disconnect()
	}, [])

	return contentRef
}