import { useEffect } from "react"

/**
 * Activates a screen wake lock while `active` is true.
 * Automatically re-acquires the lock after the page becomes visible again.
 */
export function useWakeLock(active: boolean): void {

	useEffect(() => {
		if (!active || !navigator.wakeLock) return

		let isCancelled = false
		let isRequesting = false
		let sentinel: WakeLockSentinel | null = null

		const acquire = async () => {
			if (sentinel || isRequesting || document.visibilityState !== "visible") {
				return
			}
			isRequesting = true

			try {
				sentinel = await navigator.wakeLock.request('screen')
				if (isCancelled) {
					sentinel.release()
					sentinel = null
					return
				}
				sentinel.addEventListener("release", () => {
					sentinel = null
				})
			} catch {
				// Failed acquisition (e.g. low battery policy, document not active)
			} finally {
				isRequesting = false
			}
		}

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				acquire()
			}
		}

		acquire()
		document.addEventListener('visibilitychange', onVisibilityChange)

		return () => {
			isCancelled = true
			document.removeEventListener('visibilitychange', onVisibilityChange)
			
			if (sentinel) {
				sentinel.release()
				sentinel = null
			}
		}
	}, [active])
}
