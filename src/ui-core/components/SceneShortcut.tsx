import classNames from "classnames"
import styles from "../styles/scene-shortcut.module.scss"
import { ReactNode } from "react";
import GraphicsGroup from "../../graphics/GraphicsGroup";
import { Graphics } from "../../types";

type Props = {
	unlocked: boolean
	images: Partial<Graphics>
	title: ReactNode
	subtitle?: ReactNode
	attention?: boolean
} & React.HTMLAttributes<HTMLDivElement>

const SceneShortcut = ({unlocked, images, title, subtitle, attention, ...props}: Props) => {

	return (
		<div
			{...props}
			className={classNames(styles.shortcut, {[styles.unlocked]: unlocked, "unlocked": unlocked, [styles.attention]: attention}, props.className)}
			tabIndex={unlocked ? 0 : -1}
			role="button"
			onContextMenu={e => e.preventDefault()}
		>
			{unlocked ?
				<GraphicsGroup
					className={styles.image}
					images={images}
				/>
			:
				<div className={classNames(styles.image, styles.placeholder)} />
			}
			
			<div className={styles.text}>
				<div className={`${styles.sceneTitle} title`}>
					{unlocked ? title : "???"}
				</div>
				
				<div className={`${styles.sceneSubtitle} subtitle`}>
					{(unlocked && subtitle)
						? subtitle
						: (unlocked && !subtitle)
							? "" : "???"
					}
				</div>
			</div>
		</div>
	)
}

export default SceneShortcut