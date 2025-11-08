import { ReactNode } from "react"
import styles from "../styles/layouts.module.scss"

type Props = {
	children: ReactNode
}
const PageTitle = ({ children }: Props) => {
	return <h2 className={`${styles.pageTitle} page-title`}>{children}</h2>
}

export default PageTitle