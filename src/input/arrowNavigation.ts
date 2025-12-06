
type NavElement = HTMLElement | SVGElement

function searchNavElmtUp(from: NavElement | null) {
    let e: NavElement | null = from
    while (e && !(e.hasAttribute('nav-x') || e.hasAttribute('nav-y'))) {
        e = e.parentElement
    }
    return e
}
function searchNavElmtsDown(from: NavElement) {
    let elements = [...(from?.children ?? [])] as NavElement[]
    const result = []
    let e
    while (e = elements.pop()) {
        if ((e instanceof SVGElement || e.offsetParent) && (e.hasAttribute('nav-x') || e.hasAttribute('nav-y')))
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
    if (fixedAttr == null) // no attribute => [-inf; +inf]
        min = -Infinity, max = +Infinity
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
            case 'up'    : return [tempX, maxY]
            case 'down'  : return [tempX, minY]
            case 'left'  : return [minX, tempY]
            case 'right' : return [maxX, tempY]
        }
    }
    else {
        tempX = Math.min(Math.max(minX, current[0]), maxX)
        tempY = Math.min(Math.max(minY, current[1]), maxY)
        switch(direction) {
            case 'up'    : return [tempX, minY]
            case 'down'  : return [tempX, maxY]
            case 'left'  : return [maxX, tempY]
            case 'right' : return [minX, tempY]
        }
    }

}

function setTempNavAttr(elmt: NavElement, axe: 'x'|'y', value: number) {
    const attr = `nav-temp-${axe}`
    elmt.setAttribute(attr, (Math.abs(value) > 2e-9 ? value : 0).toString())
    elmt.addEventListener('blur', elmt.removeAttribute.bind(elmt, attr))
}

type Direction = 'up'|'down'|'left'|'right'|'in'|'out'

export type NavigationProps = {
    'nav-x'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
    'nav-y'?: number | `${number}` | `${number|'*'}${' - '|'-'}${number|'*'}`
    'nav-noscroll'?: 1 // cannot use boolean on custom props
}

/**
 * Change the focused element to the next one in the specified direction, based
 * on the `"nav-x"` and `"nav-y"` html attributes and the specified direction.
 * @param direction direction of the new element to focus
 * @returns `true` if a new element has been focused, `false` otherwise
 */
export function directionalNavigate(direction: Direction) {
    // Search the closest navigation element
    let elmt = searchNavElmtUp(document.activeElement as NavElement)
               ?? document.body

    // If navigating towards child elements, get all navigation children,
    // and chose the one with lowest absolute nav-y and nav-x
    if (direction == 'in') {
        let children = searchNavElmtsDown(elmt)
        let minY = Infinity, minX = Infinity
        let first: NavElement | null = null
        for (let child of children) {
            let x: number = Math.abs(parseFloat(child.getAttribute('nav-x') ?? '-1'))
            let y: number = Math.abs(parseFloat(child.getAttribute('nav-y') ?? '-1'))
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
        y = direction == 'up' ? 1e-9 : -1e-9
    } else {
        // get best x and y attributes for element
        [x, y] = getNavValues(elmt, direction)
    }
    let _y = null, _x = null, _elmt = null
    for (const n of neighbours) {
        if (n == elmt)
            continue
        const [nx, ny] = getNavValues(n, direction, [x, y])
        switch (direction) {
            case 'up' :
                if (ny >= y || (_y != null && ny < _y)) break
                if (_y == null || ny > _y) [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(x - nx) < Math.abs(x - _x!)) [_x, _elmt] = [nx, n]
                break
            case 'down' :
                if (ny <= y || (_y != null && ny > _y)) break
                if (_y == null || ny < _y) [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(x - nx) < Math.abs(x - _x!)) [_x, _elmt] = [nx, n]
                break
            case 'left' :
                if (nx >= x || (_x != null && nx < _x)) break
                if (_x == null || nx > _x) [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(y - ny) < Math.abs(y - _y!)) [_y, _elmt] = [ny, n]
                break
            case 'right' :
                if (nx <= x || (_x != null && nx > _x)) break
                if (_x == null || nx < _x) [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(y - ny) < Math.abs(y - _y!)) [_y, _elmt] = [ny, n]
                break
        }
    }
    if (_elmt) {
        if (_elmt.hasAttribute('nav-noscroll'))
            _elmt.focus({preventScroll: true})
        else
            _elmt.focus()
        
        setTempNavAttr(_elmt, 'x', _x!)
        setTempNavAttr(_elmt, 'y', _y!)
        return true
    }
    return false
}

export function navProps(y: number, x: number) {
    return {'nav-x': x, 'nav-y': y}
}

export default directionalNavigate