
type NavElement = HTMLElement | SVGElement

type Direction = 'up'|'down'|'left'|'right'|'in'|'out'

export type NavigationProps = ({
    'nav-x'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
    'nav-y'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
} | {
    'nav-auto'?: 1
}) & {
    'nav-scroll'?: 'none'|'smooth' // cannot use boolean on custom props
}

function isNavElmt(elmt: NavElement | null): elmt is NavElement {
    return elmt != null && (
        elmt.hasAttribute('nav-x') ||
        elmt.hasAttribute('nav-y') ||
        elmt.hasAttribute('nav-auto'))
}

function searchNavElmtUp(from: NavElement | null) {
    let e: NavElement | null = from
    while (e && !isNavElmt(e)) {
        e = (e as NavElement).parentElement
    }
    return e
}
function searchNavElmtsDown(from: NavElement) {
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

function getNavAttr(elmt: NavElement, axe: 'x'|'y'): [number, number, number] {
    const fixedAttr = elmt.getAttribute(`nav-${axe}`)
    const tempAttr = elmt.getAttribute(`nav-temp-${axe}`)
    let min: number, max: number, temp: number
    if (fixedAttr == null) {
        if (elmt.hasAttribute('nav-auto')) { // nav-auto => use client rect
            const rect = elmt.getClientRects()[0]
            switch (axe) {
                case 'x' : min = rect.left; max = rect.right; break
                case 'y' : min = rect.top; max = rect.bottom; break
            }
        } else {// no attribute => [-inf; +inf]
            min = -Infinity, max = +Infinity
        }
    }
    else if (fixedAttr.match(/^-?[\d.]+$/))
        min = max = parseFloat(fixedAttr) // n => [n; n]
    else {
        const m = fixedAttr.match(/^(\*|-?[\d.]+)\s?-\s?(\*|-?[\d.]+)$/)
        if (m) { // n1-n2 | n1-* | *-n2 | *-* => [n1; n2] (* = +-inf)
            min = (m[1] == '*') ? -Infinity : parseFloat(m[1])
            max = (m[2] == '*') ? +Infinity : parseFloat(m[2])
        } else
            throw Error(`Unsupported nav-${axe} pattern "${fixedAttr}"`)
    }
    if (tempAttr != null)          temp = parseFloat(tempAttr)
    else if (min == max)           temp = min
    else if (min <= 0 && 0 <= max) temp = 0
    else if (min == -Infinity)     temp = max
    else                           temp = min
    return [min, max, temp]
}

function getNavValues(elmt: NavElement, direction: Exclude<Direction, 'in'|'out'>,
                      current?: [number, number]): [number, number] {
    let [minX, maxX, tempX] = getNavAttr(elmt, 'x'),
        [minY, maxY, tempY] = getNavAttr(elmt, 'y')
    if (current == null) { // elmt is the source
        switch (direction) {
            case 'up'    : return [tempX, minY]
            case 'down'  : return [tempX, maxY]
            case 'left'  : return [minX, tempY]
            case 'right' : return [maxX, tempY]
        }
    }
    else {
        tempX = Math.min(Math.max(minX, current[0]), maxX)
        tempY = Math.min(Math.max(minY, current[1]), maxY)
        switch(direction) {
            case 'up'    : return [tempX, maxY]
            case 'down'  : return [tempX, minY]
            case 'left'  : return [maxX, tempY]
            case 'right' : return [minX, tempY]
        }
    }

}

function setTempNavAttrs(elmt: NavElement, x: number, y: number) {
    
    elmt.setAttribute('nav-temp-x', (Math.abs(x) > 2e-9 ? x : 0).toString())
    elmt.setAttribute('nav-temp-y', (Math.abs(y) > 2e-9 ? y : 0).toString())
    elmt.addEventListener('blur', ()=> {
        elmt.removeAttribute('nav-temp-x')
        elmt.removeAttribute('nav-temp-y')
    })
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
        elmt = searchNavElmtUp(elmt)
               ?? document.body

    // If navigating towards child elements, get all navigation children,
    // and chose the one with lowest absolute nav-y and nav-x
    if (direction == 'in') {
        let children = searchNavElmtsDown(elmt)
        let minY = Infinity, minX = Infinity
        let first: NavElement | null = null
        for (let child of children) {
            let x = Math.abs(getNavAttr(child, 'x')[0])
            let y = Math.abs(getNavAttr(child, 'y')[0])
            if (y < minY || (y == minY && x < minX)) {
                minY = y
                minX = x
                first = child
            }
        }
        if (first) {
            first.focus()
            return true
        } else {
            return false
        }
    }
    // If navigating out or to neighbours, first get parent navigation element
    // get its parent navigation element
    let parent = searchNavElmtUp(elmt.parentElement)
    if (direction == 'out') {
        if (parent && parent != document.body) {
            parent.focus()
            return true
        } else {
            return false
        }
    }
    if (!parent)
        parent = document.body
    const neighbours = searchNavElmtsDown(parent)
    let x, y
    if (elmt == document.body) { // will select item at [0, 0] from the opposite direction
        x = direction == 'left' ? 1e-9 : -1e-9
        y = direction == 'up'   ? 1e-9 : -1e-9
    } else {
        // get best x and y attributes for element
        [x, y] = getNavValues(elmt, direction)
    }
    let minDist = Infinity, _elmt = null, _x, _y
    for (const n of neighbours) {
        if (n == elmt)
            continue
        const [nx, ny] = getNavValues(n, direction, [x, y])
        switch (direction) {
            case 'up'    : if (ny >= y) continue; break
            case 'down'  : if (ny <= y) continue; break
            case 'left'  : if (nx >= x) continue; break
            case 'right' : if (nx <= x) continue; break
        }
        const dx = x - nx, dy = y - ny
        const d = Math.sqrt(dx*dx + dy*dy)
        if (d < minDist)
            [_elmt, minDist, _x, _y] = [n, d, nx, ny]
    }
    if (_elmt) {
        switch (_elmt.getAttribute('nav-scroll')) {
            case null : _elmt.focus(); break
            case 'none' : _elmt.focus({preventScroll: true}); break
            case 'smooth' :
                _elmt.focus({preventScroll: true})
                _elmt.scrollIntoView({behavior: "smooth", block: 'nearest'})
                break
            default :
                throw Error(`Unexpected nav-scroll value "${
                    _elmt.getAttribute('nav-scroll')}"`)
        }
        
        setTempNavAttrs(_elmt, _x!, _y!)
        return true
    }
    return false
}

export function navProps(y: number, x: number) {
    return {'nav-x': x, 'nav-y': y}
}

export default directionalNavigate