
function searchNavElmtUp(from: HTMLElement | null) {
    let e: HTMLElement | null = from
    while (e && !(e.hasAttribute('nav-x') || e.hasAttribute('nav-y'))) {
        e = e.parentElement
    }
    return e
}
function searchNavElmtsDown(from: HTMLElement) {
    let elements = [...(from?.children ?? [])] as HTMLElement[]
    const result = []
    let e
    while (e = elements.pop()) {
        if (e.offsetParent && (e.hasAttribute('nav-x') || e.hasAttribute('nav-y')))
            result.push(e)
        else
            elements.push(...e.children as Iterable<HTMLElement>)
    }
    return result
}

type Direction = 'up'|'down'|'left'|'right'|'in'|'out'

/**
 * Change the focused element to the next one in the specified direction, based
 * on the `"nav-x"` and `"nav-y"` html attributes and the specified direction.
 * @param direction direction of the new element to focus
 * @returns `true` if a new element has been focused, `false` otherwise
 */
export function directionalNavigate(direction: Direction) {
    // Search the closest navigation element
    let elmt = searchNavElmtUp(document.activeElement as HTMLElement)
               ?? document.body

    // If navigating towards child elements, get all navigation children,
    // and chose the one with lowest nav-y and nav-x
    if (direction == 'in') {
        let children = searchNavElmtsDown(elmt)
        let minY = Infinity, minX = Infinity
        let first: Element | null = null
        for (let child of children) {
            let x: number = parseFloat(child.getAttribute('nav-x') ?? '-1')
            let y: number = parseFloat(child.getAttribute('nav-y') ?? '-1')
            if (y < minY || (y == minY && x < minX)) {
                minY = y
                minX = x
                first = child
            }
        }
        if (first && first instanceof HTMLElement) {
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
        if (parent && parent instanceof HTMLElement) {
            parent.focus()
            return true
        } else {
            return false
        }
    }
    if (!parent)
        parent = document.body
    const neighbours = searchNavElmtsDown(parent)
    
    const attrX = elmt.getAttribute('nav-x'), attrY = elmt.getAttribute('nav-y')
    const x = attrX ? parseFloat(attrX) : (direction == 'left') ? 0.5 : -0.5
    const y = attrY ? parseFloat(attrY) : (direction == 'up') ? 0.5 : -0.5

    let _y = null, _x = null, _elmt = null
    for (const n of neighbours) {
        const nx = parseFloat(n.getAttribute('nav-x') ?? '0')
        const ny = parseFloat(n.getAttribute('nav-y') ?? '0')
        switch (direction) {
            case 'up' :
                if (ny >= y || (_y != null && ny < _y))
                    continue
                if (_y == null || ny > _y)
                    [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(x - nx) < Math.abs(x - _x!))
                    [_x, _elmt] = [nx, n]
                break
            case 'down' :
                if (ny <= y || (_y != null && ny > _y))
                    continue
                if (_y == null || ny < _y)
                    [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(x - nx) < Math.abs(x - _x!))
                    [_x, _elmt] = [nx, n]
                break
            case 'left' :
                if (nx >= x || (_x != null && nx < _x))
                    continue
                if (_x == null || nx > _x)
                    [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(y - ny) < Math.abs(y - _y!))
                    [_y, _elmt] = [ny, n]
                break
            case 'right' :
                if (nx <= x || (_x != null && nx > _x))
                    continue
                if (_x == null || nx < _x)
                    [_x, _y, _elmt] = [nx, ny, n]
                else if (Math.abs(y - ny) < Math.abs(y - _y!))
                    [_y, _elmt] = [ny, n]
                break
        }
    }
    if (_elmt instanceof HTMLElement) {
        _elmt.focus()
        return true
    }
    return false
}

export function navProps(y: number, x: number) {
    return {'nav-x': x, 'nav-y': y}
}

export default directionalNavigate