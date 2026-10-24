import { memo, ReactNode, useCallback, useLayoutEffect, useMemo, useRef } from "react"
import { COLUMN_WIDTH, DY, SCENE_WIDTH } from "../constants"
import { PopoverProvider, usePopover, usePopoverTrigger } from "../components/PopoverProvider"
import { attachCameraControls, Camera, Rect } from "./camera"
import { FcLinks } from "./links"
import { FcCanvasItem, FcCanvasNode, FcOverlayDrawer, FlowchartRenderer } from "./renderer"
import "./canvas.scss"

const MIN_SCALE = 0.45
const MAX_SCALE = 3
const FOCUS_MARGIN = 24
const TOP_PADDING_REM = 4

type Props<N extends FcCanvasNode> = {
	items: FcCanvasItem<N>[]
	links: FcLinks
	bounds: Rect
	/** scene centered when the flowchart opens, e.g. the current scene */
	center?: Rect
	onSelect?: (node: N) => void
	renderPopover: (node: N) => ReactNode
	drawOverlay?: FcOverlayDrawer
}

export function flowchartBounds(nodes: Rect[]): Rect {
	const bounds = nodes.reduce((b, node) => ({
		left: Math.min(b.left, node.left),
		top: Math.min(b.top, node.top),
		right: Math.max(b.right, node.right),
		bottom: Math.max(b.bottom, node.bottom),
	}), { left: Infinity, top: Infinity, right: 0, bottom: 0 })
	const padX = COLUMN_WIDTH - SCENE_WIDTH
	return { left: bounds.left - padX, top: bounds.top - DY,
		right: bounds.right + padX, bottom: bounds.bottom + DY }
}

function remPx() {
	return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function initialScale(viewportWidth: number, bounds: Rect) {
	const width = Math.max(bounds.right - bounds.left, 10 * COLUMN_WIDTH)
	return Math.min(
		Math.max(remPx() / 10, viewportWidth / width),
		viewportWidth / (2 * COLUMN_WIDTH)) // minimum 2 scenes visible
}

/**
 * Horizontal area of the viewport where the flowchart is framed when opened:
 * the content box of the parent container. The viewport can be wider (in
 * game, it spans the whole screen while the container has the page width).
 */
function homeColumn(viewport: HTMLElement) {
	const container = viewport.parentElement!
	const style = getComputedStyle(container)
	const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
	const paddingRight = Number.parseFloat(style.paddingRight) || 0
	const viewportRect = viewport.getBoundingClientRect()
	// ratio between screen and layout px, if an ancestor is being transformed
	const ratio = viewportRect.width / (viewport.clientWidth || 1) || 1
	const left = (container.getBoundingClientRect().left - viewportRect.left) / ratio
		+ paddingLeft
	const width = container.clientWidth - paddingLeft - paddingRight
	return { left, width: Math.min(width, viewport.clientWidth) }
}


//##############################################################################
//#region                        HIT TARGETS
//##############################################################################

type HitTargetProps<N extends FcCanvasNode> = {
	item: FcCanvasItem<N>
	onClick: (node: N) => void
}

/**
 * Transparent element over a scene, so the clicks, the popover, the focus
 * and the arrow-keys navigation work as with any DOM element.
 */
const HitTarget = memo(<N extends FcCanvasNode>({ item, onClick }: HitTargetProps<N>) => {
	const { node, disabled, popover, nav } = item
	const trigger = usePopoverTrigger(node)
	return (
		<button type="button"
			className="fc-hit"
			data-node={node.id}
			aria-label={node.id}
			tabIndex={disabled ? -1 : 0}
			style={{
				left: node.left, top: node.top,
				width: node.right - node.left, height: node.bottom - node.top,
				pointerEvents: disabled ? 'none' : undefined,
			}}
			{...(nav && { 'nav-scroll': 'none', 'nav-x': nav.x, 'nav-y': nav.y })}
			{...(!disabled && popover && trigger)}
			onClick={disabled ? undefined : () => onClick(node)}
		/>
	)
}) as <N extends FcCanvasNode>(props: HitTargetProps<N>) => ReactNode


//#endregion ###################################################################
//#region                            VIEW
//##############################################################################

const FlowchartCanvasView = <N extends FcCanvasNode>(
		{ items, links, bounds, center, onSelect, drawOverlay }: Props<N>) => {
	const { closePopover } = usePopover()
	const viewportRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const layerRef = useRef<HTMLDivElement>(null)
	const engineRef = useRef<{ camera: Camera, renderer: FlowchartRenderer } | null>(null)

	const content = useMemo(() => ({ items, links, overlay: drawOverlay }),
		[items, links, drawOverlay])
	const propsRef = useRef({ content, bounds, center })
	propsRef.current = { content, bounds, center }

	// create the camera and renderer, bind the inputs
	useLayoutEffect(() => {
		const viewport = viewportRef.current!
		const layer = layerRef.current!
		const canvas = canvasRef.current!
		const camera = new Camera()
		const renderer = new FlowchartRenderer(canvas, camera, viewport)
		engineRef.current = { camera, renderer }

		camera.onChange = () => {
			layer.style.transform =
				`matrix(${camera.scale},0,0,${camera.scale},${camera.tx},${camera.ty})`
			renderer.requestDraw()
		}
		camera.bounds = propsRef.current.bounds
		renderer.setContent(propsRef.current.content)

		let placed = false
		const layout = (width: number, height: number, pixelWidth: number, pixelHeight: number) => {
			if (width == 0 || height == 0)
				return
			const { bounds, center } = propsRef.current
			const home = homeColumn(viewport)
			const scale = initialScale(home.width, bounds)
			camera.minScale = scale * MIN_SCALE
			camera.maxScale = scale * MAX_SCALE
			camera.setViewport(width, height)
			renderer.resize(width, height, pixelWidth, pixelHeight)
			if (placed)
				return
			placed = true
			if (center) {
				camera.moveTo(scale,
					home.left + home.width / 2 - (center.left + center.right) / 2 * scale,
					height / 2 - (center.top + center.bottom) / 2 * scale)
			} else {
				const contentWidth = (bounds.right - bounds.left) * scale
				const tx = contentWidth < home.width
					? home.left + (home.width - contentWidth) / 2 - bounds.left * scale
					: home.left - bounds.left * scale
				camera.moveTo(scale, tx, TOP_PADDING_REM * remPx() - bounds.top * scale)
			}
			camera.onChange()
		}
		
		const snappedSize = (): [number, number] => {
			const rect = canvas.getBoundingClientRect()
			const dpr = devicePixelRatio || 1
			return [Math.round(rect.right * dpr) - Math.round(rect.left * dpr),
				Math.round(rect.bottom * dpr) - Math.round(rect.top * dpr)]
		}

		layout(canvas.clientWidth, canvas.clientHeight, ...snappedSize())

		const resizeObserver = new ResizeObserver(entries => {
			const entry = entries.at(-1)!
			const { width, height } = entry.contentRect
			const pixelBox = entry.devicePixelContentBoxSize?.[0] // not on Safari
			layout(width, height, ...(pixelBox
				? [pixelBox.inlineSize, pixelBox.blockSize] as [number, number]
				: snappedSize()))
		})
		try {
			resizeObserver.observe(canvas, { box: 'device-pixel-content-box' })
		} catch {
			resizeObserver.observe(canvas)
		}

		const detach = attachCameraControls(camera, viewport, closePopover)
		return () => {
			detach()
			resizeObserver.disconnect()
			renderer.dispose()
			engineRef.current = null
		}
	}, [closePopover])

	useLayoutEffect(() => {
		const engine = engineRef.current
		if (!engine)
			return
		engine.camera.bounds = bounds
		engine.renderer.setContent(content)
	}, [content, bounds])

	const onClick = useCallback((node: N) => {
		closePopover()
		onSelect?.(node)
	}, [closePopover, onSelect])

	const itemOf = (target: EventTarget | null) => {
		const id = (target as Element | null)?.closest?.('[data-node]')?.getAttribute('data-node')
		return id ? items.find(item => item.node.id == id) : undefined
	}

	const setHighlight = (key: 'hovered' | 'focused', id: string | null) => {
		const renderer = engineRef.current?.renderer
		if (!renderer || renderer[key] == id)
			return
		renderer[key] = id
		renderer.requestDraw()
	}

	const onFocus = (event: React.FocusEvent) => {
		const item = itemOf(event.target)
		setHighlight('focused', item?.node.id ?? null)
		if (item)
			engineRef.current?.camera.ensureVisible(item.node, FOCUS_MARGIN)
	}

	return (
		<div className="fc-viewport" ref={viewportRef}>
			<canvas className="fc-canvas" ref={canvasRef} />
			<div className="fc-hit-layer" ref={layerRef}
				onFocus={onFocus}
				onBlur={() => setHighlight('focused', null)}
				onPointerOver={e => setHighlight('hovered', itemOf(e.target)?.node.id ?? null)}
				onPointerOut={() => setHighlight('hovered', null)}>
				{items.map(item => item.kind != 'hidden' &&
					<HitTarget key={item.node.id} item={item} onClick={onClick} />
				)}
			</div>
		</div>
	)
}

/**
 * Flowchart drawn on a canvas, with a camera for panning and zooming.
 */
export const FlowchartCanvas = <N extends FcCanvasNode>(props: Props<N>) => (
	<PopoverProvider renderContent={props.renderPopover}>
		<FlowchartCanvasView {...props} />
	</PopoverProvider>
)
