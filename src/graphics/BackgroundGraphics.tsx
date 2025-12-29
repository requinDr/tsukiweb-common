import { memo } from "react"
import GraphicsElement from "../graphics/GraphicsElement"

type Props = {
	image: string
	bgAlign?: string
}
const BackgroundGraphics = ({image, bgAlign}: Props)=> {
	return (
		<GraphicsElement key={image}
			pos='bg'
			image={image}
			bg-align={bgAlign}
		/>
	)
}

export default memo(BackgroundGraphics)