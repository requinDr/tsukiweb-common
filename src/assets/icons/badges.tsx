import { ReactNode, SVGProps, useId } from "react"
import "./badges.scss"

const ICON_SIZE = 7
export const BADGE_VIEWBOX = `-${ICON_SIZE/2} -${ICON_SIZE/2} ${ICON_SIZE} ${ICON_SIZE}`
export const POINT_BACKGROUND = "#202020"
export const FLAG_BACKGROUND = "var(--flag-background)"
export const STRIKE_COLOR = "#ff3b3b"
export const FLAG_CONTENT = { x: 0.15, y: -0.55, scale: 0.95 }
const FLAG_CONTENT_TRANSFORM = `translate(${FLAG_CONTENT.x},${FLAG_CONTENT.y}) scale(${FLAG_CONTENT.scale})`
export const POINT_RADIUS = 3.2
export const POINT_SIGN = { x: 0.44, y: 0.53 }
const HEAD_SCALE = 1.15

export function headRect(r: number) {
  const size = 2 * r * HEAD_SCALE
  return { x: -size / 2, y: r - size, size }
}

export const BADGE_PATHS = {
  pointPlus: "m1.75,0.425l0,2.4m-1.2,-1.2l2.4,0",
  pointMinus: "m0.55,1.625l2.4,0",
  pointArc: `M0 ${POINT_RADIUS}a${POINT_RADIUS} ${POINT_RADIUS} 0 11${POINT_RADIUS}-${POINT_RADIUS}`,
  flag: "M-2.9-2.6q3-1.2 6 0v5q-3-1.2-6 0z",
  flagPole: "M-3.2,-3.2 V3.2",
  strike: "M-3.2,-3.2 L3.2,3.2",
  link: `M0-.4v.8zm.4.5v.5c0 .22-.18.4-.4.4-.22 0-.4-.18-.4-.4
v-.5m.8-.2v-.5c0-.22-.18-.4-.4-.4-.22 0-.4.18-.4.4v.5`
}

export type BadgeBaseProps = {
  persists?: boolean,
} & SVGProps<SVGSVGElement>

export const BadgeBase = ({children, persists = false, viewBox = BADGE_VIEWBOX,
                    ...props}: BadgeBaseProps)=> {
  return <svg className="badge" viewBox={viewBox} height="1em" overflow="visible" {...props}>
    {children}
    {persists && <BadgeLinkSVGIcon transform="translate(2.5,-1.9) scale(1.3)"/>}
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
  <path d={BADGE_PATHS.pointMinus} stroke="var(--regard-minus-color, #ff0000)" fill="none" {...props}/>

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

const PointSVGIcon = ({open = false, fill = POINT_BACKGROUND, ...props}:
    {open?: boolean, fill?: string} & SVGProps<SVGGElement>)=> {
    const r = POINT_RADIUS
    const circle_props = {cx: 0, cy: 0, r, fill}
    return open ? <g {...props}>
      <circle {...circle_props} stroke="none"/>
      <path d={BADGE_PATHS.pointArc} fill="none"/>
    </g> : <circle {...circle_props}/>
}

/**
 * Drawn after the outline of its shape, so the overflowing part covers it.
 * @param r radius of the shape
 * @param shape cuts the head below the center. Defaults to the inside of a point outline.
 */
export const HeadSVGIcon = ({img, r = POINT_RADIUS, shape = <circle r={r - 0.3}/>}:
    {img: string, r?: number, shape?: ReactNode})=> {
  const clipId = `head-clip${useId().replace(/[^\w-]/g, '')}`
  const {x, y, size} = headRect(r)
  return <>
    <clipPath id={clipId}>
      {shape}
      <rect x={-2*r} y={-4*r} width={4*r} height={4*r}/>
    </clipPath>
    <image href={img} x={x} y={y} width={size} height={size} clipPath={`url(#${clipId})`}/>
  </>
}

type FlagBadgeProps = {
    icon: ReactNode
    negative?: boolean
} & BadgeBaseProps

export const FlagBadge = ({icon, negative, children, ...props}: FlagBadgeProps) =>
  <BadgeBase {...props}>
    <FlagSVGIcon neg={negative}/>
    <g transform={FLAG_CONTENT_TRANSFORM}>
      {(typeof icon == "string") ?
        <BadgeChar stroke={FLAG_BACKGROUND}>{icon}</BadgeChar>
      : icon}
    </g>
    {children}
  </BadgeBase>

type PointBadgeProps = BadgeBaseProps & {
    icon: ReactNode,
    value?: number,
    fill?: string
}
export const PointBadge = ({icon, value = 0, fill, children, ...props}: PointBadgeProps) => {
  let content
  if (value == 0) {
      content = <>
        <PointSVGIcon fill={fill}/>
        {(typeof icon == "string") ? <BadgeChar>{icon}</BadgeChar> : icon}
      </>
  } else {
    const abs = Math.abs(value)
    const sign = Math.sign(value)
    if (abs > 1) {
      const width = ICON_SIZE * abs
      props = {
        viewBox:`-${width - ICON_SIZE/2} -${ICON_SIZE/2} ${width} ${ICON_SIZE}`,
        ...props
      }
    }
    const signTransform = `translate(${POINT_SIGN.x},${POINT_SIGN.y})`
    content = [...Array(abs)].map((_,i)=>
      <g key={i} transform={`translate(-${i*ICON_SIZE},0)`}>
        <PointSVGIcon open fill={fill}/>
        {(typeof icon == "string") ? <BadgeChar>{icon}</BadgeChar> : icon}
        {(value > 0) ?
          <BadgePlusSVGIcon transform={signTransform}/>
        : <BadgeMinusSVGIcon transform={signTransform}/>}
      </g>
    )
  }
  return <BadgeBase {...props}>
    {content}
    {children}
  </BadgeBase>
}

type RegardBadgeProps = BadgeBaseProps & {
  fill: string,
  img?: string,
  value?: number
}

export const RegardBadge = ({ img, children, ...props }: RegardBadgeProps) =>
  <PointBadge icon={img && <HeadSVGIcon img={img}/>} {...props}>{children}</PointBadge>
