import { createContext, ReactNode, useContext } from "react"
import { ResolutionId } from "./utils/lang"

export type LibConfig<T = any> = {
	imageSrc: (src: string, res?: ResolutionId) => string
	cg: {
		shouldBlur: (img: string) => boolean
	}
}

const CommonConfigContext = createContext<LibConfig<any> | null>(null)

export const CommonProvider = <T,>({ config, children }: { config: LibConfig<T>, children: ReactNode }) => (
	<CommonConfigContext.Provider value={config}>{children}</CommonConfigContext.Provider>
)

export const useGameConfig = <T,>() => {
	const context = useContext(CommonConfigContext)
	if (!context) throw new Error("Missing Provider")
	return context as LibConfig<T>
}