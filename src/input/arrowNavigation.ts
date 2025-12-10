
import { Dir } from "fs"
import { distance } from "motion"

type NavElement = HTMLElement | SVGElement

type Direction = 'up'|'down'|'left'|'right'|'in'|'out'

export type NavigationProps = ({
    'nav-x'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
    'nav-y'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
} | {
    'nav-auto'?: 1
}) & {
    'nav-scroll'?: 'none'|'smooth' // cannot use boolean on custom props
    'nav-up'?: string
    'nav-down'?: string
    'nav-left'?: string
    'nav-right'?: string
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
    if (min == max)                return min
    else if (min <= 0 && 0 <= max) return 0
    else if (min == -Infinity)     return max
    else                           return min
}

class NavHandler {
    elmt: NavElement
    direction?: Exclude<Direction, 'in'|'out'>
    grid?: Record<'top'|'bottom'|'left'|'right', number>
    gridTemp?: [number, number] // [x, y]
    absolute: Record<'top'|'bottom'|'left'|'right', number>
    absTemp?: [number, number]

    constructor(elmt: NavElement, direction: Exclude<Direction, 'out'>);
    constructor(elmt: NavElement);
    constructor(elmt: NavElement, direction?: Exclude<Direction, 'out'>) {
        this.elmt = elmt
        if (elmt == document.body || direction == 'in') {
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

            this.absTemp = [rect.left, rect.top]
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
                this.absTemp = readNavTempAttr(elmt.getAttribute('nav-temp-abs')) ??
                    [(this.absolute.left + this.absolute.right)/2,
                    (this.absolute.top + this.absolute.bottom)/2]
                
                if (this.grid) {
                    this.gridTemp = readNavTempAttr(elmt.getAttribute('nav-temp-grid')) ??
                    [computeTempGridValue(this.grid.left, this.grid.right),
                    computeTempGridValue(this.grid.top, this.grid.bottom)]
                }
            } else {
                this.absTemp = undefined
                this.gridTemp = undefined
            }
        }
        this.direction = direction
    }
    private getGridDistance(handler: NavHandler): [number, number]|null {
        
        // case direction == 'in' or from <body>
        if (this.grid!.left > this.grid!.right) {
            if (handler.grid!.left <= 0 && handler.grid!.right >= 0 &&
                handler.grid!.top <= 0 && handler.grid!.right >= 0) {
                return [1e-9, 1e-9] // element contains 0,0. No need to look further.
            }
        }
        let dM: number // main (direction-aligned) distance
        switch (this.direction!) {
            case 'up'   : dM = this.grid!.top - handler.grid!.bottom; break
            case 'down' : dM = handler.grid!.top - this.grid!.bottom; break
            case 'left' : dM = this.grid!.left - handler.grid!.right; break
            case 'right': dM = handler.grid!.left - this.grid!.right; break
        }
        if (dM < 0) return null
        switch (this.direction!) {
            case 'up' : case 'down' :
                const x = this.gridTemp![0]
                const closestX = clamp(handler.grid!.left, handler.grid!.right, x)
                return [dM, Math.abs(x - closestX)]
            case 'left' : case 'right' :
                const y = this.gridTemp![1]
                const closestY = clamp(handler.grid!.top, handler.grid!.bottom, y)
                return [dM, Math.abs(y - closestY)]
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
                const closestX = clamp(r2.left, r2.right, this.absTemp![0])
                return [dM, (r2.right < r1.left) ? r1.left - r2.right
                          : (r2.left > r1.right) ? r2.left - r1.right
                          : 0, // 0 because at least one point aligned
                        Math.abs(this.absTemp![0] - closestX)]
            case 'left' : case 'right' :
                const closestY = clamp(r2.top, r2.bottom, this.absTemp![1])
                return [dM, (r2.bottom < r1.top) ? r1.top - r2.bottom
                          : (r2.top > r1.bottom) ? r2.top - r1.bottom
                          : 0,
                        Math.abs(this.absTemp![1] - closestY)]
        }
    }
    searchBestTarget(elements: NavElement[]) {
        let minGridDistance = [Infinity, 0], minAbsDistance = Infinity,
            minAngle = 4, minTempDist = 0, bestElmt = null // pi ~= 4

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
                        bestElmt = elmt
                    }
                }
            // consider absolute distance only if grid distance has not found any appropriate element
            } else if (minGridDistance[0] == Infinity) {
                const dist = this.getAbsoluteDistance(handler)
                if (dist) {
                    const angle = Math.atan2(dist[1], dist[0])
                    if (angle < minAngle) { // prefer minimum angle
                        minAngle = angle
                        minAbsDistance = dist[0] // don't care for secondary axis if angle is lower
                        minTempDist = dist[2]
                        bestElmt = elmt
                    } else if (angle == minAngle) {
                        if (dist[0] < minAbsDistance) {
                            minAbsDistance = dist[0]
                            minTempDist = dist[2]
                            bestElmt = elmt
                        } else if (dist[0] == minAbsDistance) {
                            if (dist[2] < minTempDist) {
                                minTempDist = dist[2]
                                bestElmt = elmt
                            }
                        }
                    }
                }
            }
        }
        return bestElmt
    }
}

function isNavElmt(elmt: NavElement | null, gridOnly = false): elmt is NavElement {
    return elmt != null && (
        elmt.hasAttribute('nav-x') ||
        elmt.hasAttribute('nav-y') ||
        ((!gridOnly) && elmt.hasAttribute('nav-auto')))
}

function searchNavElmtOut(from: NavElement | null) {
    let e: NavElement | null = from
    while (e && !isNavElmt(e)) {
        e = (e as NavElement).parentElement
    }
    return e
}

function searchNavElmtsIn(from: NavElement) {
    let elements = [...(from?.children ?? [])] as NavElement[]
    const result = []
    let e
    while (e = elements.pop()) {
        if ((e instanceof SVGElement || e.offsetParent) && isNavElmt(e))
            result.push(e)
        else
            elements.push(...e.children as Iterable<NavElement>)
    }
    return result
}

function setTempNavAttrs(elmt: NavElement, abs?: [number, number],
                         grid?: [number, number]) {
    if (abs)
        elmt.setAttribute('nav-temp-abs', abs.join(','))
    if (grid)
        elmt.setAttribute('nav-temp-grid',
            grid.map(x => Math.abs(x) > 2e9 ? x : 0).join(','))
    elmt.addEventListener('blur', ()=> {
        elmt.removeAttribute('nav-temp-grid')
        elmt.removeAttribute('nav-temp-abs')
    })
}
function moveToTarget(elmt: NavElement, tempGrid?: [number, number], tempAbs?: [number, number]) {
    
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
    if (tempGrid || tempAbs) {
        setTempNavAttrs(elmt, tempGrid, tempAbs)
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
        elmt = searchNavElmtOut(elmt)
               ?? document.body
    
    let target: NavElement | null = null
    const designated = elmt.getAttribute(`nav-${direction}`)
    if (designated) {
        let node = elmt
        target = node.querySelector(designated)
        while (!target && node != document.body) {
            node = node?.parentElement ?? document.body
            target = node.querySelector(designated)
        }
    } else if (direction == 'out') {
        const parent = searchNavElmtOut(elmt.parentElement)
        if (parent && parent != document.body) {
            target = parent
        }
    } else {
        const parent = ((direction == 'in') ? elmt
                     : searchNavElmtOut(elmt.parentElement)) ?? document.body
        const nav = new NavHandler(elmt, direction)
        const candidates = searchNavElmtsIn(parent)
        target = nav.searchBestTarget(candidates)
    }
    if (target) {
        if (!['in', 'out'].includes(direction)) { // no temporary position for in/out
            moveToTarget(target) //TODO search temp grid and absolute coordinates
        } else {
            moveToTarget(target)
        }
        return true
    }
    return false
}

export default directionalNavigate