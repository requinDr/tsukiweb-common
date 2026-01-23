/**
 * Handles files opened with the PWA
 * https://developer.mozilla.org/en-US/docs/Web/API/Launch_Handler_API
 */

type FileHandler = (file: File) => Promise<void>

const fileHandlers: Map<string, FileHandler> = new Map()
const LAUNCH_FILES_PROCESSED_KEY = 'launchFilesProcessed'

export function registerFileHandler(extension: string, handler: FileHandler) {
	fileHandlers.set(extension.toLowerCase(), handler)
}

function waitForAppReady(): Promise<void> {
	return new Promise(resolve => {
		if (document.readyState === 'complete') {
			setTimeout(resolve, 100) // ensure components are mounted
		} else {
			window.addEventListener('load', () => setTimeout(resolve, 100), { once: true })
		}
	})
}

async function processFile(file: File) {
	const extension = file.name.split('.').pop()?.toLowerCase()
	if (!extension) return

	const handler = fileHandlers.get(extension)
	if (handler) {
		await handler(file)
	} else {
		console.warn(`No handler registered for .${extension} files`)
	}
}

export function initFileHandling() {
	if ('launchQueue' in window) {
		(window as any).launchQueue.setConsumer(async (launchParams: any) => {
			if (!launchParams.files?.length) return
			
			// Check if it's a new file or a refresh
			const fileHandle = launchParams.files[0]
			const file = await fileHandle.getFile()
			const fileKey = `${file.name}_${file.lastModified}`
			
			// Prevents re-prompt on page refresh
			if (sessionStorage.getItem(LAUNCH_FILES_PROCESSED_KEY) === fileKey) return
			sessionStorage.setItem(LAUNCH_FILES_PROCESSED_KEY, fileKey)

			await waitForAppReady()
			await processFile(file)
		})
	}
}