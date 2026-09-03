import { RefObject, TouchEvent, TouchEventHandler, useEffect } from "react"
import { getScrollableParent } from "../utils/utils"
import { SiThings } from "react-icons/si";

type Direction = ""|"left"|"right"|"up"|"down"

type SwipeListener = (direction: Direction, distance: number, event: TouchEvent|PointerEvent, dx: number, dy: number)=>boolean|void

const events = ["touchstart" , "touchmove"  , "touchend" , "touchcancel",
                "pointerdown", "pointermove", "pointerup", "pointercancel",
                "click"]

function getPointerInfo(event: PointerEvent|TouchEvent, id?: number): {id: number, x: number, y: number}|undefined {
  if (event instanceof PointerEvent) {
    if (id !== undefined && id != event.pointerId)
      return undefined
    return { id: event.pointerId, x: event.clientX, y: event.clientY }
  } else {
    const touch = (id !== undefined) ?
        Array.from(event.changedTouches).find(touch=>touch.identifier == id)
      : event.changedTouches[0]
    return touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY} : undefined
  }
}

class GestureHandler {
  private _onEvent: TouchEventHandler
  private swipeListener: SwipeListener|undefined
  private element: HTMLElement|undefined
  private minDistance: number
  private moveTriggered = false
  private start: {id: number, x: number, y: number}|undefined = undefined
  private captureTarget: Element|undefined
  private lastTouch = {x: -1, y: -1}
  constructor(element: HTMLElement|null|undefined, {
      swipeTrigDistance = 20, onSwipe = undefined as SwipeListener|undefined} = {}) {
    this._onEvent = this.eventHandler.bind(this)
    this.minDistance = swipeTrigDistance
    this.swipeListener = onSwipe
    if (element) {
      this.enable(element)
    }
  }
  enable(element: HTMLElement) {
    this.disable()
    this.element = element
    for (const evt of events) {
      element.addEventListener(evt, this._onEvent as unknown as (event: Event)=>void, {passive: false})
    }
  }
  disable() {
    if (this.element) {
      for (const evt of events) {
        this.element.removeEventListener(evt, this._onEvent as unknown as (event: Event)=>void)
      }
    }
  }

  get onEvent() {
    return this._onEvent
  }

  private onSwipe(dir: Direction, dist: number, evt: TouchEvent|PointerEvent,
                  dx: number, dy: number) {
    const scrollDir = dir == "left" ? "right" : dir == "right" ? "left"
                    : dir == "up" ? "down" :  dir == "down" ? "up" : ""

    if (scrollDir != "" && getScrollableParent(evt.target as HTMLElement, [scrollDir]) != null)
      this.cancel()
    else if (this.swipeListener?.(dir, dist, evt, dx, dy)) {
      if (evt.cancelable)
        evt.preventDefault()
      this.cancel()
    }
  }

  private onStart(event: PointerEvent|TouchEvent) {
    if (this.start)
      return false
    const info = getPointerInfo(event)!
    this.start = info
    return true
  }
  private onMove(event: TouchEvent|PointerEvent) {
    if (!this.start)
      return
    const info = getPointerInfo(event, this.start.id)
    if (!info) 
      return false
    this.lastTouch.x = info.x
    this.lastTouch.y = info.y
    const dx = info.x - this.start.x;
    const dy = info.y - this.start.y;
    const distX = Math.abs(dx), distY = Math.abs(dy)
    const dist = Math.max(distX, distY)
    const dir = distX > distY * 2 ? (dx > 0 ? "right" : "left")
              : distY > distX * 2 ? (dy > 0 ? "down" : "up")
              : ""
    if (!this.moveTriggered &&
        dir != "" && dist > this.minDistance)
      this.moveTriggered = true;
    if (this.moveTriggered) {
      this.onSwipe(dir, dist, event, dx, dy)
    }
    return true
  }
  private onEnd(event: TouchEvent|PointerEvent) {
    if (!this.onMove(event))
      return false
    this.cancel()
    return true
  }
  private onCancel(event: TouchEvent|PointerEvent) {
    const info = getPointerInfo(event)
    if (!info)
      return false
    if (this.moveTriggered)
      this.onSwipe("", 0, event, 0, 0) // notify the listener the swipe has been canceled
    this.cancel()
  }

  private eventHandler(event: PointerEvent|TouchEvent|MouseEvent) {
    if (event instanceof PointerEvent && event.pointerType !== 'mouse')
      return
    switch (event.type) {
      case 'pointerdown':
        if ((event as PointerEvent).button !== 0)
          return
        if (this.onStart(event as PointerEvent)) {
          this.captureTarget = event.target instanceof Element ? event.target : this.element
          this.captureTarget?.setPointerCapture((event as PointerEvent).pointerId)
        }
        break
      
      case 'touchstart' :
        this.onStart(event as TouchEvent)
        break
      
      case 'pointermove':
      case 'touchmove':
        this.onMove(event as TouchEvent|PointerEvent);
        break

      case 'pointerup':
      case 'touchend':
        this.onEnd(event as TouchEvent|PointerEvent);
        break
    
      case 'pointercancel':
      case 'touchcancel':
        this.onCancel(event as TouchEvent|PointerEvent);
        break
      
      case 'click':
        if (this.moveTriggered) {
          event.preventDefault()
          event.stopPropagation()
          this.cancel()
        }
        break
    }
  }

  cancel() {
    if (!this.start)
      return
    if (this.captureTarget?.hasPointerCapture(this.start.id)) {
      this.captureTarget.releasePointerCapture(this.start.id)
    }
    this.moveTriggered = false
    this.captureTarget = undefined
    this.start = undefined
    this.lastTouch.x = -1
    this.lastTouch.y = -1
  }
}

export function useSwipeGesture(onSwipe: SwipeListener,
  target: HTMLElement|RefObject<HTMLElement|null|undefined>,
  triggerDistance = 20) {
  useEffect(()=> {
    if (!('addEventListener' in target)) {
      if ('current' in target) {
        if (!target.current)
          return // wait for the reference to be valid
        target = target.current
      } else {
        throw Error(`target is not a valid event target or reference`)
      }
    }
    if (target) {
      const handler = new GestureHandler(target, {swipeTrigDistance: triggerDistance, onSwipe})
      
      return () => {
        handler.disable()
      }
    }
  }, [target])
}

export default GestureHandler