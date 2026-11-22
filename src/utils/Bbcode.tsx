import { Link } from "wouter"
import { CSSProperties, Fragment, PropsWithoutRef, ComponentPropsWithoutRef, ReactNode, cloneElement, isValidElement, memo, useEffect, useLayoutEffect, useMemo, useRef, JSX, useCallback } from "react"
import { innerText } from "./utils"


type TagTranslator<T=string|undefined> = (tag: string, content: Array<string|JSX.Element>, arg: T, props?: Record<string, any>)=> JSX.Element

//[/?<tag>(=<arg>)?/?]
const bbcodeTagRegex = /\[(?<tag>\/?\w*)(=(?<arg>([^\/\]]|\/(?!\]))+))?(?<leaf>\/)?\]/g

//#endregion ###################################################################
//#region                       BBCODE TAG TO JSX
//##############################################################################

const simple: TagTranslator = (tag, content, _, props?)=> {
	const Tag = tag as 'b'|'i'|'s'|'sup'|'sub'
	return (
		<Tag {...(props ?? {})} key={props?.key}>
			{content}
		</Tag>
	)
}

const leaf: TagTranslator = (tag, content, _, props?)=> {
	const Tag = tag as 'br'|'wbr'
	const {key, ...attrs} = props as PropsWithoutRef<any>
	if (content.length == 0)
		return <Tag {...props} key={key}/>
	else if (attrs && Object.getOwnPropertyNames(attrs).length > 0)
		return (
			<span {...props} key={key}>
				<Tag/>{content}
			</span>
		)
	else
		return <Fragment key={key}><Tag/>{content}</Fragment>
}

const styled: TagTranslator<Record<string, any>> = (tag, content, style, props?)=> {
	const Tag = tag as 'span'
	let {style: _s, ...attrs} = props || {}
	style = {
		...style,
		...(_s || {})
	}
	return (
		<Tag {...(attrs ?? {})} style={style} key={props?.key}>
			{content}
		</Tag>
	)
}

const align: TagTranslator = (tag, content, arg, props?)=> {
	const width = arg ? `${arg}em` : "100%"
	return styled('span', content,
		{ textAlign: tag, display: "inline-block", width },
		props)
}

const shadow: TagTranslator = (_, content, arg = "", props?)=> {
	const [color, size] = arg.split(',').map(value=> value.trim())
	const edge = `calc(${size} / 5)`, negative = `calc(${size} / -5)`
	const shadows = [
		`${edge} 0 0 ${color}`, `${negative} 0 0 ${color}`,
		`0 ${edge} 0 ${color}`, `0 ${negative} 0 ${color}`,
		`${edge} ${edge} 0 ${color}`, `${edge} ${negative} 0 ${color}`,
		`${negative} ${edge} 0 ${color}`, `${negative} ${negative} 0 ${color}`,
		`0 0 ${size} ${color}`, `0 0 ${size} ${color}`,
		`0 0 calc(${size} + ${size}) ${color}`,
		`0 0 calc(${size} + ${size}) ${color}`,
		`0 0 calc(${size} + ${size}) ${color}`
	]
	return styled('span', content, {textShadow: shadows.join(', ')}, props)
}

const url: TagTranslator = (_, content, arg, props?)=> {
	if (!arg)
		arg = innerText(content)
	if (arg?.startsWith("'") && arg.endsWith("'"))
		arg = arg.substring(1, arg.length-1)
	if (arg.lastIndexOf('.') > arg.lastIndexOf('/') || arg.startsWith("http"))
		return (
			<a href={arg} target="_blank" {...(props || {})} rel="noreferrer" key={props?.key}>
				{content}
			</a>
		)
	else
		return (
			<Link href={arg} {...(props || {})} key={props?.key}>
				{content}
			</Link>
		)
}

const line: TagTranslator = (_, content, arg, props?)=> {
	const n = parseInt(arg || "1")
	const {key, className: insertClass, ...attrs} = props ?? {}
	let className = 'dash'
	if (insertClass) className += insertClass
	return <Fragment key={key}>
		{simple('span', ["\u{2013}".repeat(n)], "",
						{className, ...attrs})}
		{content}
	</Fragment>
}
const ruby: TagTranslator = (_, content, arg, props?)=> {
	return <ruby {...props}>
		{content}
		<rp>(</rp>
		<rt>{arg}</rt>
		<rp>)</rp>
	</ruby>
}

/**
 * The default bbcode dictionary used to convert bbcode to JSX.
 * New dictionaries should extend it.
 */
const defaultBBcodeDict: Record<string, TagTranslator> = {
	''		: (_, content, _a, props)=> simple('span', content, _, props),
	'br' 	: leaf,		'wbr' 	: leaf,
	'sup' 	: simple,	'sub' 	: simple,
	'b' 	: simple,	'i' 	: simple,	's' : simple,
	'center': align,	'left'	: align,	'right'	: align,
	'url'	: url,		'line'	: line,		'ruby'	: ruby,
	'u'		: (_, content, _a, props)=> styled('span', content, {textDecoration: "underline"}, props),
	'size' 	: (_, content, arg, props)=> styled('span', content, {fontSize: arg}, props),
	'font'	: (_, content, arg, props)=> styled('span', content, {fontFamily: arg}, props),
	'color' : (_, content, arg, props)=> styled('span', content, {color: arg}, props),
	'opacity':(_, content, arg, props)=> styled('span', content, {opacity: arg}, props),
	'shadow': shadow,
	'noline': (_, content, _a, props)=> styled('span', content, {textShadow: "none"}, props),
	'hide'	: (_, content, _a, props)=> styled('span', content, {visibility: "hidden"}, props),
	'copy'	: (_, content, _a, props)=> <span {...props} key={props?.key}>&copy;{content}</span>,
	'class'	: (_, content, arg, props)=> <span className={arg} {...props} key={props?.key}>{content}</span>,
}

//#endregion ###################################################################
//#region                      TEXT TO BBCODE TREE
//##############################################################################

type BbNode = {tag: string, arg: string, content: (BbNode|string)[]}

function tagToJSX({tag, arg, content}: BbNode, dict: typeof defaultBBcodeDict,
									props?: Record<string, any>): JSX.Element {
	const transform = dict[tag]
	if (!transform)
		throw Error(`Unknown bbcode tag ${tag}`)
	const children = content.map((n, i)=>
			n.constructor == String ?
				<Fragment key={i}>{n}</Fragment>
			: tagToJSX(n as BbNode, dict, {key: i})
	)
	return transform(tag, children, arg, props)
}

function createTree(text: string): BbNode {
	const nodes = [{tag:"", arg: "", content:[]} as BbNode]
	let lastIndex = 0
	text = text.replaceAll("\n", "[br/]")
	let m
	while ((m = bbcodeTagRegex.exec(text)) !== null) {
		let {tag, arg, leaf} = m.groups ?? {}
		const currNode = nodes[nodes.length-1]
		if (m.index != lastIndex) {
			const subText = text.substring(lastIndex, m.index)
			currNode.content.push(subText)
		}
		lastIndex = bbcodeTagRegex.lastIndex
		if (tag.startsWith('/')) {
			if ((tag.length > 1 && tag.substring(1) != currNode?.tag) || nodes.length == 1)
				throw Error(`Unmatched [${tag}] in "${text}"`)
			nodes.pop()
		} else {
			if (arg && ((arg.startsWith('"') && arg.endsWith('"')) ||
					    (arg.startsWith("'") && arg.endsWith("'"))))
				arg = arg.substring(1, arg.length-1)
			const node = {tag, arg, content: []}
			currNode.content.push(node)
			if (!leaf)
				nodes.push(node)
		}
	}
	if (lastIndex < text.length) // unclosed tag
		nodes[nodes.length-1].content.push(text.substring(lastIndex))
	return (nodes.length > 1 && nodes[0].content.length == 1) ? nodes[1] : nodes[0]
}

/**
 * Check if the texts has unclosed bbcode tags.
 * If it has, add as many '[/]' as required at the end of the text
 * to close them.
 * @param text string with bbcode tags
 * @returns the input text with all bbcode tags closed
 */
export function closeBB(text: string): string {
	const openCount = Array.from(text.matchAll(/\[\w+(=(\/?[^\]\/]+)+)?\]/g)).length
	const closeCount = Array.from(text.matchAll(/\[\/\w*\]/g)).length
	if (openCount == closeCount)
		return text
	else return text + '[/]'.repeat(openCount-closeCount)
}

/**
 * Convert the text to JSX components by extracting and converting bbcode tags.
 * @param text string with bbcode tags
 * @param props props to add to the root component
 * @param dict dictionary of translation functions from bbcode tags to JSX components.
 * @see {@link defaultBBcodeDict}.
 * @returns the JSX component made from converting the bbcode text
 */
export function bb(text: string, props?: Record<string, any>, dict=defaultBBcodeDict) {
	const root = createTree(text)
	return tagToJSX(root, dict, props)
}

function innerBbText(node: BbNode): string {
	if (node.tag == "hide" || node.tag == "br")
		return " "
	const content = node.content.reduce<string>((str, child)=> {
		if (child.constructor == String)
			return str + child
		return str + innerBbText(child as BbNode)
	}, "")
	if (node.tag == "line")
		return "-".repeat(parseInt(node.arg || "1")) + content
	return content
}

/**
 * Extract the visible text from the string with bbcode tags.
 * Remove hidden content (with [hide]), and converts [line=n] to n times '-'.
 * @param text string with bbcode tags to extract visible text from
 * @returns the extracted text
 */
export function noBb(text: string): string {
	return text ? innerBbText(createTree(text)) : ""
}

/**
 * Render plain text with dashes displayed as continuous lines.
 */
export function textWithDashes(text: string): ReactNode[] {
	return text.split(/([-―─]{2,})/).map((part, i)=>
		i % 2 ? <span key={i} className="dash">{"\u{2013}".repeat(part.length)}</span> : part)
}

//#endregion ###################################################################
//#region                           COMPONENTS
//##############################################################################

//___________________________________<Bbcode>___________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

type Props = {
	text: string,
	dict?: typeof defaultBBcodeDict,
	rootPrefix?: ReactNode,
	rootSuffix?: ReactNode
} & ComponentPropsWithoutRef<"span">

function withSuffix(node: JSX.Element, suffix: JSX.Element): JSX.Element {
	const children: ReactNode[] = [node.props.children].flat()
	const last = children.at(-1)
	if (isValidElement<{style?: CSSProperties, children?: ReactNode}>(last) && last.props.style?.display == "inline-block")
		children[children.length - 1] = withSuffix(last, suffix)
	else
		children.push(suffix)
	return cloneElement(node, undefined, children)
}

export const Bbcode = memo(({text, dict = defaultBBcodeDict, rootPrefix: prefix, rootSuffix: suffix, ...props}: Props)=> {
	let root = bb(text, props, dict)
	if (prefix || suffix) {
		root = withSuffix(cloneElement(root, undefined, [prefix, ...root.props.children]),
			<Fragment key="suffix">{suffix}</Fragment>)
	}
	return root
})

//________________________________<BBTypeWriter>________________________________
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

const UNIT_CLASS = "tw-u"
const VISIBLE_CLASS = "tw-v"
const UNIT_TAGS = new Set(["line", "copy", "ruby"])
const NO_UNIT_TAGS = new Set(["br", "wbr"])

const graphemeSegmenter = (("Intl" in window) && ("Segmenter" in Intl)) ?
	new Intl.Segmenter(undefined, { granularity: "grapheme" })
	// fallback to split chars and pretend they are segments
	: { segment(text: string) { return text.split('').map(c=>({segment:c})) } }

type UnitRef = (el: HTMLElement | null)=> VoidFunction | undefined

type TypewriterContext = {
	dict: typeof defaultBBcodeDict
	unitRef: (index: number)=> UnitRef
	count: number
}

function splitGraphemes(text: string, ctx: TypewriterContext) {
	return Array.from(graphemeSegmenter.segment(text), ({segment}, i)=>
		<span className={UNIT_CLASS} key={i} ref={ctx.unitRef(ctx.count++)}>{segment}</span>
	)
}

function tagToTypewriterJSX(node: BbNode, ctx: TypewriterContext,
							props?: Record<string, any>, isRoot = false): JSX.Element {
	const {tag, arg, content} = node
	const transform = ctx.dict[tag]
	if (!transform)
		throw Error(`Unknown bbcode tag ${tag}`)
	const isUnit = !isRoot && (UNIT_TAGS.has(tag) || (content.length == 0 && !NO_UNIT_TAGS.has(tag)))
	const unitIndex = isUnit ? ctx.count++ : -1
	const children = content.map((n, i)=>
		n.constructor == String ?
			<Fragment key={i}>{splitGraphemes(n as string, ctx)}</Fragment>
		: tagToTypewriterJSX(n as BbNode, ctx, {key: i})
	)
	if (!isUnit)
		return transform(tag, children, arg, props)
	const {key, ...attrs} = props ?? {}
	return (
		<span className={UNIT_CLASS} key={key} ref={ctx.unitRef(unitIndex)}>
			{transform(tag, children, arg, attrs)}
		</span>
	)
}

type TWProps = Props & {
	charDelay: number
	restartOnAppend?: boolean
	paused?: boolean
	onFinish?: VoidFunction
}

// avoids revealing the whole text at once when coming back to a hidden tab
const MAX_TICK_DELTA = 100

/**
 * Display the bbcode text character by character.
 * The whole text is rendered once with each character in a hidden span,
 * and characters are revealed by adding a class to their span.
 */
export const BBTypeWriter = memo(({text, dict = defaultBBcodeDict, charDelay,
		rootPrefix, rootSuffix, restartOnAppend=false, paused = false,
		onFinish, ...props}: TWProps)=> {
	const units = useRef<(HTMLElement | undefined)[]>([])
	const unitCount = useRef<number>(0)
	const unitRefs = useRef<UnitRef[]>([])
	const revealed = useRef<number>(0)
	const prevText = useRef<string>("")
	const finished = useRef<boolean>(true)
	const delay = useRef<number>(charDelay)
	const timer = useRef<number>(0)
	const elapsed = useRef<number>(0)

	const stopAnim = useCallback(()=> {
		if (timer.current) {
			clearTimeout(timer.current)
			timer.current = 0
		}
	}, [])

	const onEnd = useCallback<VoidFunction>(()=> {
		stopAnim()
		if (!finished.current) {
			finished.current = true
			onFinish?.()
		}
	}, [onFinish, stopAnim])

	const onEndRef = useRef(onEnd)
	useEffect(()=> { onEndRef.current = onEnd }, [onEnd])

	const unitRef = useCallback((index: number)=> {
		unitRefs.current[index] ??= (el)=> {
			if (!el)
				return
			units.current[index] = el
			el.classList.toggle(VISIBLE_CLASS, index < revealed.current)
			return ()=> {
				if (units.current[index] == el)
					units.current[index] = undefined
			}
		}
		return unitRefs.current[index]
	}, [])

	const reveal = useCallback((count: number)=> {
		const end = Math.min(revealed.current + count, unitCount.current)
		for (let i = revealed.current; i < end; i++)
			units.current[i]?.classList.add(VISIBLE_CLASS)
		revealed.current = end
		return end >= unitCount.current
	}, [])


	const startAnim = useCallback(()=> {
		if (timer.current || document.hidden)
			return
		let last = performance.now()
		const tick = ()=> {
			const now = performance.now()
			elapsed.current += Math.min(Math.max(now - last, 0), MAX_TICK_DELTA)
			last = now
			const count = Math.floor(elapsed.current / delay.current)
			if (count > 0) {
				elapsed.current -= count * delay.current
				if (reveal(count)) {
					timer.current = 0
					return onEndRef.current()
				}
			}
			timer.current = window.setTimeout(tick, delay.current - elapsed.current)
		}
		timer.current = window.setTimeout(tick, delay.current - elapsed.current)
	}, [reveal])

	useEffect(()=> stopAnim, [stopAnim])

	const pausedRef = useRef(paused)
	pausedRef.current = paused

	useEffect(()=> {
		const onVisibilityChange = ()=> {
			if (document.hidden)
				stopAnim()
			else if (!pausedRef.current && !finished.current && delay.current != 0)
				startAnim()
		}
		document.addEventListener("visibilitychange", onVisibilityChange)
		return ()=> document.removeEventListener("visibilitychange", onVisibilityChange)
	}, [startAnim, stopAnim])

	const root = useMemo(()=> {
		const tree = createTree(text)
		return tree.tag == "" ? tree : {tag: "", arg: "", content: [tree]}
	}, [text])
	const ctx: TypewriterContext = {dict, unitRef, count: 0}
	let resultNode = tagToTypewriterJSX(root, ctx, props, true)
	const renderedUnits = ctx.count
	useLayoutEffect(()=> {
		unitCount.current = renderedUnits
		units.current.length = renderedUnits
	})

	useLayoutEffect(()=> {
		if (text == prevText.current)
			return
		const appended = !restartOnAppend && prevText.current != ""
			&& text.startsWith(prevText.current)
		prevText.current = text
		finished.current = false
		const keep = appended ? Math.min(revealed.current, unitCount.current) : 0
		for (let i = 0; i < unitCount.current; i++)
			units.current[i]?.classList.toggle(VISIBLE_CLASS, i < keep)
		revealed.current = keep
		if (charDelay == 0) {
			reveal(Infinity)
			onEnd()
		} else if (reveal(0)) {
			onEnd()
		} else if (!paused) {
			startAnim()
		}
	}, [text])

	useEffect(()=> {
		delay.current = charDelay
		if (charDelay == 0) {
			if (!finished.current) {
				reveal(Infinity)
				onEnd()
			}
		} else if (paused) {
			stopAnim()
		} else if (!finished.current) {
			startAnim()
		}
	}, [charDelay, paused, onEnd, reveal, startAnim, stopAnim])

	if (rootPrefix || rootSuffix) {
		rootPrefix = <Fragment key="prefix">{rootPrefix}</Fragment>
		resultNode = withSuffix(cloneElement(resultNode, undefined, [rootPrefix, ...resultNode.props.children]),
			<Fragment key="suffix">{rootSuffix}</Fragment>)
	}
	return resultNode
})
