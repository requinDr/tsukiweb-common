export function disableContextMenu() {
	document.addEventListener('contextmenu', (e) => {
		const target = e.target as HTMLElement | null
		if (target?.closest('input, textarea, [contenteditable="true"]')) return
		e.preventDefault()
	})
}
