import { DY, OVERLAP_BREAK_LENGTH } from "../constants"

export interface FcLinkNode {
	id: string
	centerX: number
	top: number
	bottom: number
	cutAt: number
	group?: string
	parents: FcLinkNode[]
}

/** Link overlaping another link */
export type FcDashedLink = {
	group?: string
	d: string
	dash: number[]
}

/** SVG path of the links, merged when they share the same style */
export type FcLinks = {
	disabled: string
	enabled: [group: string | undefined, d: string][]
	disabledDashed: FcDashedLink[]
	enabledDashed: FcDashedLink[]
}

/** Path from the bottom of a parent to the top of a child */
export function linkPath(x1: number, y1: number, x2: number, y2: number): string {
	if (x1 === x2) return `M${x1},${y1}V${y2}`
	if (y1 === y2) return `M${x1},${y1}H${x2}`

	const turnY = x2 > x1 ? y1 + DY : y2 - DY

	return turnY > y1
		? `M${x1},${y1}V${turnY}H${x2}V${y2}`
		: `M${x1},${y1}H${x2}V${y2}`
}

/**
 * @param isDisabled whether the link between `parent` and `node` is drawn
 *        as disabled
 * @param pathD path builder, if a game routes its links differently
 */
export function computeLinks<N extends FcLinkNode>(nodes: N[],
		isDisabled: (parent: N, node: N) => boolean,
		pathD = linkPath): FcLinks {
	const disabled: string[] = []
	const enabledByGroup = new Map<string | undefined, string[]>()
	const enabledDashed: FcDashedLink[] = []
	const disabledDashed: FcDashedLink[] = []

	for (const node of nodes) {
		const { centerX: x2, top: y2 } = node
		for (const parent of node.parents as N[]) {
			const { centerX: x1, bottom: y1, group } = parent
			const linkDisabled = isDisabled(parent, node)
			const d = pathD(x1, y1, x2, y2)

			if (node.cutAt !== 0) {
				const totalLength = (y2 - y1) + Math.abs(x2 - x1)
				const cutLength = node.cutAt * DY
				const halfBreak = OVERLAP_BREAK_LENGTH / 2
				const link = {
					group, d,
					dash: [totalLength - cutLength - halfBreak, OVERLAP_BREAK_LENGTH, cutLength - halfBreak],
				}
				;(linkDisabled ? disabledDashed : enabledDashed).push(link)
			} else if (linkDisabled) {
				disabled.push(d)
			} else {
				const paths = enabledByGroup.get(group)
				if (paths) paths.push(d)
				else enabledByGroup.set(group, [d])
			}
		}
	}

	return {
		disabled: disabled.join(' '),
		enabled: Array.from(enabledByGroup, ([group, paths]) => [group, paths.join(' ')]),
		disabledDashed,
		enabledDashed,
	}
}
