import { ComponentProps } from 'react';
import styles from '../styles/fixedfooter.module.scss';

type Props = {
	children?: React.ReactNode
} & ComponentProps<'footer'>
const FixedFooter = ({ children, className, ...props }: Props) => {
	return (
		<footer className={`${styles.footer} ${className || ''}`} {...props}>
			<div className={styles.footerContent}>
				{children}
			</div>
		</footer>
	)
}

export default FixedFooter