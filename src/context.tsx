import { createContext, ReactNode, useContext } from "react"
import { ResolutionId } from "./utils/lang"

export type LibConfig = {
	imageSrc: (src: string, res?: ResolutionId) => string
	cg: {
		shouldBlur: (img: string) => boolean
	}
}

const CommonConfigContext = createContext<LibConfig | null>(null)

export const CommonProvider = ({ config, children }: { config: LibConfig, children: ReactNode }) => (
	<CommonConfigContext.Provider value={config}>{children}</CommonConfigContext.Provider>
)

export const useGameConfig = () => {
	const context = useContext(CommonConfigContext)
	if (!context) throw new Error("Missing Provider")
	return context
}