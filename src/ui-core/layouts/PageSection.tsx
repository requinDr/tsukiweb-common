import { forwardRef, ReactNode } from 'react';
import styles from '../styles/layouts.module.scss';

type Props = {
	children: ReactNode
	[key: string]: any
}

const PageSection = forwardRef<HTMLElement, Props>(({ children, ...props }, ref) => {
	return (
		<section
			{...props}
			ref={ref}
			className={`${styles.pageSection} page-section ${props.className || ''}`}
		>
			{children}
		</section>
	)
})

export default PageSection