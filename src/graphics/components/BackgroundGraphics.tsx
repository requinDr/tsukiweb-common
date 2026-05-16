import { memo } from "react"
import TransitionGraphic from "./TransitionGraphic"

type Props = {
	image: string
	bgAlign?: string
}
const BackgroundGraphics = ({image, bgAlign}: Props)=> {
	return (
		<TransitionGraphic key={image}
			pos='bg'
			image={image}
			bg-align={bgAlign}
		/>
	)
}

export default memo(BackgroundGraphics)