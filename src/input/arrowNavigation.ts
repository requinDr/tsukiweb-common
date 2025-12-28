
interface _NavXElement extends Element {
    getAttribute(qualifiedName: 'nav-x'): `${number}`
    getAttribute(qualifiedName: string): string | null
}
interface _NavYElement extends Element {
    getAttribute(qualifiedName: 'nav-y'): `${number}`
    getAttribute(qualifiedName: string): string | null
}
interface _NavAutoElement extends Element {
    getAttribute(qualifiedName: 'nav-auto'): '1'
    getAttribute(qualifiedName: string): string | null
}
interface _NavRootElement extends Element {
    getAttribute(qualifiedName: 'nav-root'): '1'
    getAttribute(qualifiedName: string): string | null
}
type NavXElement = (HTMLElement | SVGElement) & _NavXElement
type NavYElement = (HTMLElement | SVGElement) & _NavYElement
type NavAutoElement = (HTMLElement | SVGElement) & _NavAutoElement
type NavRootElement = ((HTMLElement | SVGElement) & _NavRootElement) | HTMLBodyElement

type NavElement = (NavXElement | NavYElement | NavAutoElement | NavRootElement)

type Direction = 'up'|'down'|'left'|'right'|'in'|'out'

export type NavigationProps = (({
    'nav-x'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
    'nav-y'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
} | {
    'nav-auto'?: 1
}) & {
    'nav-scroll'?: 'none'|'smooth' // cannot use boolean on custom props
    'nav-up'?: string // selector for forced navigation
    'nav-down'?: string
    'nav-left'?: string
    'nav-right'?: string
}) | {
    'nav-root'?: 1
}

function clamp(min: number, max: number, value: number) {
    return Math.min(Math.max(min, value), max)
}

function readNavGridAttr(attr: string | null): [number, number] {
    if (attr == null)
        return [-Infinity, +Infinity]
    if (attr.match(/^-?[\d.]+$/)) {
        const value = parseFloat(attr)
        return [value, value]
    }
    const m = attr.match(/^(\*|-?[\d.]+)\s?-\s?(\*|-?[\d.]+)$/)
    if (m) {
        const min = (m[1] == '*') ? -Infinity : parseFloat(m[1])
        const max = (m[2] == '*') ? -Infinity : parseFloat(m[2])
        return [min, max]
    }
    throw Error(`Unsupported nav-x or nav-y format "${attr}"`)
}

function readNavTempAttr(attr: string | null): [number, number] | undefined {
    return attr?.split(',').map(parseFloat) as [number, number] ?? undefined
}

function computeTempGridValue(min: number, max: number) {
    return (min <= 0 && 0 <= max) ? 0
         : (min == -Infinity) ? max
         : min
}

class NavHandler {
    elmt: NavElement
    direction?: Exclude<Direction, 'in'|'out'>
    grid?: Record<'top'|'bottom'|'left'|'right', number>
    gridTemp?: [number, number] // [x, y]
    absolute: Record<'top'|'bottom'|'left'|'right', number>
    center?: [number, number]

    constructor(elmt: NavElement, direction?: Exclude<Direction, 'out'>) {
        this.elmt = elmt
        if (isNavRoot(elmt) || direction == 'in') {
            const rect = elmt.getClientRects()[0]
            if (direction == 'in')
                direction = 'down'
            else {
                if (!direction) throw Error("cannot use <body> as a target")
            }
            // absolute positionnning takes first element next to top-left corner.
            this.absolute = {left: -Infinity, top: -Infinity,
                    right: rect.left, bottom: rect.top}
            // inverted rectangle to enable selecting element at position 0
            // with the specified direction
            this.grid = {left: 1e-9, top: 1e-9, right: -1e-9, bottom: -1e-9}

            this.center = [rect.left, rect.top]
            this.gridTemp = [0, 0]
            
        } else {
            const rect = elmt.getClientRects()[0]
            this.absolute = rect
            const attrX = elmt.getAttribute('nav-x')
            const attrY = elmt.getAttribute('nav-y')
            if (attrX || attrY) {
                const xRange = readNavGridAttr(attrX)
                const yRange = readNavGridAttr(attrY)
                this.grid = {
                    left: xRange[0], right: xRange[1],
                    top: yRange[0], bottom: yRange[1]
                }
            } else {
                this.grid = undefined
            }
            if (direction) {
                this.center = [(this.absolute.left + this.absolute.right)/2,
                    (this.absolute.top + this.absolute.bottom)/2]
                
                if (this.grid) {
                    this.gridTemp = readNavTempAttr(elmt.getAttribute('nav-temp-grid')) ??
                    [computeTempGridValue(this.grid.left, this.grid.right),
                    computeTempGridValue(this.grid.top, this.grid.bottom)]
                }
            } else {
                this.center = undefined
                this.gridTemp = undefined
            }
        }
        this.direction = direction
    }

    private getGridDistance(handler: NavHandler): [number, number]|null {
        
        // case direction == 'in' or from <body>
        const r1 = this.grid!, r2 = handler.grid!
        if (r1.left > r1.right) {
            if (r2.left <= 0 && r2.right >= 0 &&
                r2.top <= 0 && r2.right >= 0) {
                return [1e-9, 1e-9] // element contains 0,0. No need to look further.
            }
        }
        let dM: number // main (direction-aligned) distance
        switch (this.direction!) {
            case 'up'   : dM = r1.top - r2.bottom; break
            case 'down' : dM = r2.top - r1.bottom; break
            case 'left' : dM = r1.left - r2.right; break
            case 'right': dM = r2.left - r1.right; break
        }
        if (dM < 0) return null
        switch (this.direction!) {
            case 'up' : case 'down' :
                const x = this.gridTemp![0]
                return [dM, Math.abs(x - clamp(r2.left, r2.right, x))]
            case 'left' : case 'right' :
                const y = this.gridTemp![1]
                return [dM, Math.abs(y - clamp(r2.top, r2.bottom, y))]
        }
    }

    private getAbsoluteDistance(handler: NavHandler): [number, number, number] | null {
        let dM // main (direction-aligned) distance
        const r1 = this.absolute, r2 = handler.absolute
        // case direction == 'in' or from <body>
        if (r1.top == -Infinity) {
            // distance from top-left corner of the container [r1.right, r1.bottom]
            return [r2.top - r1.bottom + r2.left - r1.right, 0, 0]
        }
        switch (this.direction!) {
            case 'up'    : dM = r1.top - r2.bottom; break
            case 'down'  : dM = r2.top - r1.bottom; break
            case 'left'  : dM = r1.left - r2.right; break
            case 'right' : dM = r2.left - r1.right; break
        }
        if (dM <= 0)
            return null
        switch (this.direction!) {
            case 'up' : case 'down' :
                const closestX = clamp(r2.left, r2.right, this.center![0])
                return [dM, (r2.right < r1.left) ? r1.left - r2.right
                          : (r2.left > r1.right) ? r2.left - r1.right
                          : 0, // 0 because at least one point aligned
                        Math.abs(this.center![0] - closestX)]
            case 'left' : case 'right' :
                const closestY = clamp(r2.top, r2.bottom, this.center![1])
                return [dM, (r2.bottom < r1.top) ? r1.top - r2.bottom
                          : (r2.top > r1.bottom) ? r2.top - r1.bottom
                          : 0,
                        Math.abs(this.center![1] - closestY)]
        }
    }

    searchBestTarget(elements: NavElement[]): [NavElement|null, [number, number]|null] {
        let minGridDistance = [Infinity, 0], minAbsDistance = Infinity,
            minAngle = 2, minTempDist = 0, bestElmtHandler = null // max angle = pi/2 < 2

        for (const elmt of elements) {
            if (elmt == this.elmt)
                continue
            const handler = new NavHandler(elmt)
            if (this.grid && handler.grid) {
                const dist = this.getGridDistance(handler)
                if (dist && dist[0] > 0) {
                    if (dist[0] < minGridDistance[0] ||
                        (dist[0] == minGridDistance[0] && dist[1] < minGridDistance[1])) {
                        minGridDistance = dist
                        bestElmtHandler = handler
                    }
                }
            // consider absolute distance only if grid distance has not found any appropriate element
            } else if (minGridDistance[0] == Infinity) {
                const dist = this.getAbsoluteDistance(handler)
                if (dist) {
                    const angle = Math.atan2(dist[1], dist[0])
                    if (angle < minAngle) { // Prefer minimum angle, ...
                        minAngle = angle
                        minAbsDistance = dist[0]
                        minTempDist = dist[2]
                        bestElmtHandler = handler
                    } else if (angle == minAngle) {
                        if (dist[0] < minAbsDistance) { // ... direction-aligned distance, ...
                            minAbsDistance = dist[0]
                            minTempDist = dist[2]
                            bestElmtHandler = handler
                        } else if (dist[0] == minAbsDistance) {
                            if (dist[2] < minTempDist) { // ... and center-to-center distance
                                minTempDist = dist[2]
                                bestElmtHandler = handler
                            }
                        }
                    }
                }
            }
        }
        let gridTemp: [number, number]|null = null
        if (minGridDistance[0] < Infinity) { // compute grid position memory
            let gridX = null, gridY = null
            const {left, top, right, bottom} = bestElmtHandler!.grid!
            if (left != right) gridX = clamp(left, right, this.gridTemp![0])
            if (top != bottom) gridY = clamp(top, bottom, this.gridTemp![1])
            if (gridX != null || gridY != null)
                gridTemp = [gridX ?? left, gridY ?? top]
        }
        return [bestElmtHandler?.elmt ?? null, gridTemp]
    }
}

function isElmentVisible(elmt: Element) {
    if (elmt instanceof HTMLElement)
        return elmt.offsetParent != null
    else if (elmt instanceof SVGElement && elmt.ownerSVGElement)
        return (elmt.ownerSVGElement as unknown as HTMLElement)
                .offsetParent != null
    return false
}

function getNavParent(elmt: Element | null): NavElement {
    let parent: Element = elmt?.parentElement ?? document.body
    let roots = Array(parent.querySelectorAll('*[nav-root]')).reverse()
    if (roots.length > 0) {
        for (let r of roots) {
            if (isElmentVisible(r as unknown as Element))
                return r as unknown as NavElement
        }
    }
    while (!isNavRoot(parent) && !isNavElmt(parent)) {
        parent = parent.parentElement ?? document.body
    }
    return parent as NavElement
}

function isNavRoot(elmt: Element): elmt is NavRootElement | HTMLBodyElement {
    return elmt.hasAttribute('nav-root') || elmt == document.body
}

function isNavElmt(elmt: Element, gridOnly = false): elmt is NavElement {
    return elmt != null && (
        elmt.hasAttribute('nav-x') ||
        elmt.hasAttribute('nav-y') ||
        ((!gridOnly) && elmt.hasAttribute('nav-auto')))
}

function searchNavElmtOut(from: Element | null) {
    let e: Element | null = from
    while (e && !isNavElmt(e) && !isNavRoot(e)) {
        e = (e as NavElement).parentElement
    }
    if (e && isNavElmt(e))
        return e as NavElement
    return null
}

function searchNavElmtsIn(from: Element) {
    let elements = [...(from?.children ?? [])] as (HTMLElement | SVGElement)[]
    const result = []
    let e
    while (e = elements.pop()) {
        if (isElmentVisible(e) && isNavElmt(e))
            result.push(e)
        else
            elements.push(...e.children as Iterable<HTMLElement | SVGElement>)
    }
    return result
}

function moveToTarget(elmt: NavElement, tempGrid?: [number, number]) {
    
    switch (elmt.getAttribute('nav-scroll')) {
        case null : elmt.focus(); break
        case 'none' : elmt.focus({preventScroll: true}); break
        case 'smooth' :
            elmt.focus({preventScroll: true})
            elmt.scrollIntoView({behavior: "smooth", block: 'nearest'})
            break
        default :
            throw Error(`Unexpected nav-scroll value "${
                elmt.getAttribute('nav-scroll')}"`)
    }
    if (tempGrid) {
        elmt.setAttribute('nav-temp-grid',
            tempGrid.map(x => Math.abs(x) > 2e-9 ? x : 0).join(','))
        elmt.addEventListener('blur',
            elmt.removeAttribute.bind(elmt, 'nav-temp-grid'))
    }
}

/**
 * Change the focused element to the next one in the specified direction, based
 * on the `"nav-x"` and `"nav-y"` html attributes and the specified direction.
 * @param direction direction of the new element to focus
 * @returns `true` if a new element has been focused, `false` otherwise
 */
export function directionalNavigate(direction: Direction) {
    // Search the closest navigation element
    let elmt: NavElement = document.activeElement as NavElement
    if (!isNavElmt(elmt))
        elmt = getNavParent(elmt)

    let target: NavElement | null = null
    let gridTemp: [number, number]|null = null
    const designated = elmt.getAttribute(`nav-${direction}`)
    if (designated) {
        let node = elmt
        target = node.querySelector(designated) as NavElement
        while (!target && node != document.body) {
            node = (node?.parentElement ?? document.body) as NavElement
            target = node.querySelector(designated)
        }
    } else if (direction == 'out') {
        const parent = searchNavElmtOut(elmt.parentElement)
        if (parent && parent != document.body) {
            target = parent
        }
    } else {
        const parent = (direction == 'in') ? elmt : getNavParent(elmt)
        const nav = new NavHandler(elmt, direction)
        const candidates = searchNavElmtsIn(parent);
        [target, gridTemp] = nav.searchBestTarget(candidates)
    }
    if (target) {
        if (!['in', 'out'].includes(direction) && gridTemp != null) // no temporary position for in/out
            moveToTarget(target, gridTemp)
        else
            moveToTarget(target)
        return true
    }
    return false
}

export default directionalNavigate