import { HTMLAttributes, PropsWithChildren } from 'react';
import styles from '../styles/smallcomponents.module.scss';
import classNames from 'classnames';

type MessageContainerProps = {

}

const MessageContainer = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & PropsWithChildren<MessageContainerProps>) => {
	const { className } = props

	return (
		<div {...props} className={classNames(styles.messageContainer, className)}>
			{children}
		</div>
	)
}

export default MessageContainer