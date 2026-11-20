import { ReactNode } from "react"
import styles from "../styles/link.module.scss"

type ExternalLinkProps = {
	href: string
	children: ReactNode
}
const ExternalLink = ({href, children}: ExternalLinkProps) => {
	if (!href) {
		return (
			<span aria-disabled="true" className={styles["link-disabled"]}>
				{children}
			</span>
		)
	}

	return (
		<a href={href} target="_blank">
			{children}
		</a>
	)
}

export default ExternalLink