import { useState } from "react"
import { fullscreen } from "../utils/utils"
import { useDOMEvent } from "./useDOMEvent"

export const useIsFullscreen = (): boolean => {
	const [isFs, setIsFs] = useState<boolean>(fullscreen.isOn())

	useDOMEvent((_evt)=> {
		setIsFs(fullscreen.isOn())
	}, document, 'fullscreenchange')

	return isFs
}