import { ReactNode, SVGProps } from "react"

const ICON_SIZE = 7
export const BADGE_VIEWBOX = `-${ICON_SIZE/2} -${ICON_SIZE/2} ${ICON_SIZE} ${ICON_SIZE}`
export const POINT_BACKGROUND = "#202020"
export const FLAG_BACKGROUND = "var(--flag-background)"
export const STRIKE_COLOR = "#ff3b3b"
const FLAG_CONTENT = { x: 0.15, y: -0.55, scale: 0.95 }
const FLAG_CONTENT_TRANSFORM = `translate(${FLAG_CONTENT.x},${FLAG_CONTENT.y}) scale(${FLAG_CONTENT.scale})`
const HEART_SCALE = 0.75

const HEART_PATH = `m0,2.5l-2.5,-2.5a1.66,1.66,0,1,1,2.5,-2.2a1.66,1.66,0,1,1,2.5,2.2`
export const BADGE_PATHS = {
  heart: `${HEART_PATH}z`,
  regard: (n: number) => n > 0
    ? `${HEART_PATH}
${"m-5,-2.2a1.66,1.66,0,1,1,2.5,-2.2a1.66,1.66,0,1,1,2.5,2.2".repeat(n-1)}`
    : `${HEART_PATH}
m-2.5,0.5l0.6,-0.5l-1.3,-1l0.7,-1.2
${`m-2.5,0a1.66,1.66,0,1,1,2.5,-2.2a1.66,1.66,0,1,1,2.5,2.2
m-2.29,-0.3l-0.91,-0.7l0.7,-1.2`.repeat(-n-1)}`,
  pointPlus: "m1.75,0.75l0,1.75m-0.875,-0.875l1.75,0",
  pointMinus: "m1.75,0.85m-0.875,0.5l1.75,0",
  pointArc: "M0 3a3 3 0 113-3",
  flag: "M-2.9-2.9q3-.6 6 0v5.3q-3-.6-6 0z",
  flagPole: "M-3.2,-3.2 V3.2",
  strike: "M-3.2,-3.2 L3.2,3.2",
  link: `M0-.4v.8zm.4.5v.5c0 .22-.18.4-.4.4-.22 0-.4-.18-.4-.4
v-.5m.8-.2v-.5c0-.22-.18-.4-.4-.4-.22 0-.4.18-.4.4v.5`
}

type BadgeBaseProps = {
  persists?: boolean,
} & (
  {plus?: boolean, minus?: never} |
  {plus?: never, minus?: boolean}
) & SVGProps<SVGSVGElement>

const BadgeBase = ({children, persists = false, viewBox = BADGE_VIEWBOX,
                    plus, minus, ...props}: BadgeBaseProps)=> {
  return <svg className="badge" viewBox={viewBox} height="1em" {...props}>
    {children}
    {persists && <BadgeLinkSVGIcon transform="translate(2.5,-1.9) scale(1.3)"/>}
    {plus && <BadgePlusSVGIcon transform="translate(0.3,0.4)"/>}
    {minus && <BadgeMinusSVGIcon transform="translate(0.3,0.4)"/>}
  </svg>
}

const BadgeChar = ({children, ...props}: SVGProps<SVGTextElement>)=> {
  return (
  <text y="1.6" fill="white" strokeWidth=".7" paintOrder="stroke"
        textAnchor="middle" {...props}>
    {children}
  </text>
  )
}

const FlagSVGIcon = ({neg = false, ...props}: {neg?: boolean} & SVGProps<SVGGElement>)=>
  <g {...props}>
    <path d={BADGE_PATHS.flagPole} fill="none"/>
    <path d={BADGE_PATHS.flag} fill={FLAG_BACKGROUND}/>
    {neg && <path d={BADGE_PATHS.strike} stroke={STRIKE_COLOR} strokeWidth="1"/>}
  </g>

const BadgePlusSVGIcon = (props: SVGProps<SVGPathElement>)=>
  <path d={BADGE_PATHS.pointPlus} stroke="var(--regard-plus-color, #00ff00)" fill="none" {...props}/>

const BadgeMinusSVGIcon = (props: SVGProps<SVGPathElement>)=>
  <path d={BADGE_PATHS.pointPlus} stroke="var(--regard-plus-color, #ff0000)" fill="none" {...props}/>

const BadgeLinkSVGIcon = (props: SVGProps<SVGPathElement>)=>
  <>
  <filter id="link-shadow" filterUnits="userSpaceOnUse" x="-1" y="-1.5" width="2" height="3.5"
      colorInterpolationFilters="sRGB">
    <feDropShadow dx="-.1" dy=".15" stdDeviation=".05" floodColor="black"/>
    <feDropShadow dx="+.1" dy=".15" stdDeviation=".05" floodColor="black"/>
  </filter>
  <path d={BADGE_PATHS.link}
    stroke="white" fill="none" strokeWidth=".3" strokeLinecap="butt"
    filter="url(#link-shadow)" {...props}/>
  </>

const HeartSVGIcon = ({value = 0, ...props}: {value?: number} & SVGProps<SVGPathElement>)=>
    value == 0 ?
        <path d={BADGE_PATHS.heart} {...props}/>
    : <g {...props}>
      <path d={BADGE_PATHS.regard(value)}/>
      {value > 0 ? <BadgePlusSVGIcon/> : <BadgeMinusSVGIcon/>}
    </g>

const PointSVGIcon = ({open = false, ...props}: {open?: boolean} & SVGProps<SVGGElement>)=> {
    const r = 3
    const circle_props = {cx: 0, cy: 0, r, fill: POINT_BACKGROUND}
    return open ? <g {...props}>
      <circle {...circle_props} stroke="none"/>
      <path d={`M0 ${r}a${r} ${r} 0 11${r}-${r}`} fill="none"/>
    </g> : <circle {...circle_props}/>
}

type PointBadgeProps = BadgeBaseProps & {
    icon: ReactNode
} & (
    {plus?: boolean, minus?: never} |
    {plus?: never, minus?: boolean}
)
export const PointBadge = ({icon, ...props}: PointBadgeProps) => {
    const content =
      (typeof icon != "string") ? icon
      : (icon.length == 1) ? <BadgeChar>{icon}</BadgeChar>
      : <use href={`#${icon}-icon`}/>
    return <BadgeBase {...props}>
      <PointSVGIcon open={props.plus}/>
      {content}
    </BadgeBase>
}

type FlagBadgeProps = {
    flag: ReactNode
    negative?: boolean
} & BadgeBaseProps

export const FlagBadge = ({flag, negative, ...props}: FlagBadgeProps) => {
	let content
    if (typeof flag == 'string') {
      if (flag.length > 1)
        content = <use href={`#${flag}-icon`}/>
      else
        content = <text y="1.6" stroke={FLAG_BACKGROUND} fill="white"
          strokeWidth=".7" paintOrder="stroke" textAnchor="middle">
          {flag}
        </text>
    } else {
      content = flag
    }
	return (
    <BadgeBase {...props}>
      <FlagSVGIcon neg={negative}/>
			<g transform={FLAG_CONTENT_TRANSFORM}>
        {content}
			</g>
    </BadgeBase>
	)
}

type RegardBadgeProps = {
  char: string,
  img?: string,
  value?: number
} & BadgeBaseProps

export const RegardBadge = ({ char, img, value = 0, ...props }: RegardBadgeProps) => {
	const abs = Math.max(Math.abs(value), 1)
	const sign = Math.sign(value)
  const width = ICON_SIZE * ((abs-0.5) * HEART_SCALE + 1.5)
  const left = -(width - ICON_SIZE*0.5)
	return (
    <BadgeBase viewBox={`${left} -${ICON_SIZE/2} ${width} ${ICON_SIZE}`} {...props}>
      {img && <image
        href={img}
        className="badge"
        x={left}
        y={-ICON_SIZE/2}
        height={ICON_SIZE}
      />}
      {sign != 0 ? [...Array(abs)].map((_, i) => (
        <HeartSVGIcon key={i} value={sign}
          fill={`url(#${char}_grad)`}
          strokeWidth=".8"
          transform={`translate(-${i*ICON_SIZE*HEART_SCALE},0) scale(${HEART_SCALE})`}/>
          
      )) : <HeartSVGIcon
        fill={`url(#${char}_grad)`}
        strokeWidth=".8"
        transform={`scale(${HEART_SCALE})`}/>}
    </BadgeBase>
	)
}
