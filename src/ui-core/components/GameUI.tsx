import { MdFastForward } from "react-icons/md"
import styles from "../styles/game-ui.module.scss"
import classNames from "classnames"
import { ComponentProps } from "react"

export const FfwIndicator = () => (
  <div className={styles.ffw}>
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="gradient-ffw" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--surface-light-active)">
            <animate attributeName="offset" values="-1; 1" dur="0.8s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="var(--surface-light)">
            <animate attributeName="offset" values="-0.5; 1.5" dur="0.8s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="var(--surface-light-active)">
            <animate attributeName="offset" values="0; 2" dur="0.8s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
    </svg>
    <MdFastForward />
  </div>
)

type EndLineIndicatorProps = {
  glyph: "line" | "page"
  hide: boolean
  icon: ComponentProps<"img">["src"]
}
export const EndLineIndicator = ({glyph, hide, icon}: EndLineIndicatorProps) => (
  <span className={classNames(styles.cursor, {[styles.hide]: hide})} id={glyph}>
    <img src={icon} alt={glyph} />
  </span>
)
