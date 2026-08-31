import { RefObject, TouchEvent, TouchEventHandler, useEffect } from "react"
import { getScrollableParent } from "../utils/utils"

type Direction = ""|"left"|"right"|"up"|"down"

type SwipeListener = (direction: Direction, distance: number, event: TouchEvent|PointerEvent, dx: number, dy: number)=>boolean|void

const events = ["touchstart", "touchmove", "touchend", "touchcancel"]

class GestureHandler {
  private _onTouch: TouchEventHandler
  private swipeListener: SwipeListener|undefined
  private element: HTMLElement|undefined
  private minDistance: number
  private moveTriggered = false
  private start =  {x: -1, y: -1, id: -1}
  private lastTouch = {x: -1, y: -1}
  constructor(element: HTMLElement|null|undefined, {
      swipeTrigDistance = 20, onSwipe = undefined as SwipeListener|undefined} = {}) {
    this._onTouch = this.touchEventHandler.bind(this)
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
      element.addEventListener(evt, this._onTouch as unknown as (event: Event)=>void, {passive: false})
    }
  }
  disable() {
    if (this.element) {
      for (const evt of events) {
        this.element.removeEventListener(evt, this._onTouch as unknown as (event: Event)=>void)
      }
    }
  }

  get onTouch() {
    return this._onTouch
  }

  private onSwipe(dir: Direction, dist: number, evt: TouchEvent, dx: number, dy: number) {
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

  private touchEventHandler(event: TouchEvent) {
    switch(event.type) {
      case "touchstart" :
        this.start.x = event.targetTouches[0].clientX
        this.start.y = event.targetTouches[0].clientY
        this.start.id = event.targetTouches[0].identifier
        break
      case "touchmove" :
      case "touchend" :
        if (this.start.x == -1)
          return
        if (event.type == "touchmove") {
          const touch = Array.from(event.targetTouches).find(touch=>touch.identifier == this.start.id)
          if (!touch) {
            this.cancel()
            return;
          }
          const {clientX: x, clientY: y} = touch
          this.lastTouch.x = x
          this.lastTouch.y = y
        }
        else if (this.lastTouch.x == -1) {
          this.cancel()
          return
        }
        const dx = this.lastTouch.x - this.start.x;
        const dy = this.lastTouch.y - this.start.y;
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
        if (event.type == "touchend")
          this.cancel()
        break
      case "touchcancel" :
        if (this.moveTriggered)
          this.onSwipe("", 0, event, 0, 0)
        this.cancel()
        break
    }
  }

  cancel() {
    this.moveTriggered = false
    this.start.x = -1
    this.start.y = -1
    this.start.id = -1
    this.lastTouch.x = -1
    this.lastTouch.y = -1
  }
}

class MouseGestureHandler {
  private element: HTMLElement|undefined
  private swipeListener: SwipeListener|undefined
  private minDistance: number
  private pointerId = -1
  private captureTarget: Element|undefined
  private start = {x: -1, y: -1}
  private handled = false
  private clickReset: ReturnType<typeof setTimeout>|undefined
  private _onPointer: (event: PointerEvent)=>void
  private _onClick: (event: MouseEvent)=>void

  constructor(element: HTMLElement|null|undefined, {
      swipeTrigDistance = 20, onSwipe = undefined as SwipeListener|undefined} = {}) {
    this.minDistance = swipeTrigDistance
    this.swipeListener = onSwipe
    this._onPointer = this.pointerEventHandler.bind(this)
    this._onClick = this.clickHandler.bind(this)
    if (element)
      this.enable(element)
  }

  enable(element: HTMLElement) {
    this.disable()
    this.element = element
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
      element.addEventListener(event, this._onPointer as EventListener, {passive: false})
    element.addEventListener('click', this._onClick, true)
  }

  disable() {
    if (this.element) {
      for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
        this.element.removeEventListener(event, this._onPointer as EventListener)
      this.element.removeEventListener('click', this._onClick, true)
    }
    clearTimeout(this.clickReset)
    this.cancel()
  }

  private pointerEventHandler(event: PointerEvent) {
    if (event.pointerType !== 'mouse')
      return
    switch (event.type) {
      case 'pointerdown':
        if (event.button !== 0)
          return
        this.pointerId = event.pointerId
        this.captureTarget = event.target instanceof Element ? event.target : this.element
        this.start = {x: event.clientX, y: event.clientY}
        this.captureTarget?.setPointerCapture(event.pointerId)
        break
      case 'pointermove': {
        if (event.pointerId !== this.pointerId || this.handled)
          return
        const dx = event.clientX - this.start.x
        const dy = event.clientY - this.start.y
        const distX = Math.abs(dx), distY = Math.abs(dy)
        const dist = Math.max(distX, distY)
        const direction: Direction = distX > distY * 2 ? (dx > 0 ? 'right' : 'left')
          : distY > distX * 2 ? (dy > 0 ? 'down' : 'up')
          : ''
        if (direction && dist > this.minDistance
            && !getScrollableParent(event.target as HTMLElement, [
              direction == 'left' ? 'right' : direction == 'right' ? 'left'
                : direction == 'up' ? 'down' : 'up'
            ])
            && this.swipeListener?.(direction, dist, event, dx, dy)) {
          event.preventDefault()
          this.handled = true
        }
        break
      }
      case 'pointerup':
        if (event.pointerId === this.pointerId) {
          this.cancel()
          this.clickReset = setTimeout(() => { this.handled = false })
        }
        break
      case 'pointercancel':
        if (event.pointerId === this.pointerId) {
          this.handled = false
          this.cancel()
        }
        break
    }
  }

  private clickHandler(event: MouseEvent) {
    if (this.handled) {
      event.preventDefault()
      event.stopPropagation()
      this.handled = false
    }
  }

  private cancel() {
    if (this.pointerId >= 0 && this.captureTarget?.hasPointerCapture(this.pointerId))
      this.captureTarget.releasePointerCapture(this.pointerId)
    this.pointerId = -1
    this.captureTarget = undefined
    this.start = {x: -1, y: -1}
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
      const touchHandler = new GestureHandler(target, {swipeTrigDistance: triggerDistance, onSwipe})
      const mouseHandler = new MouseGestureHandler(target, {swipeTrigDistance: triggerDistance, onSwipe})
      
      return () => {
        touchHandler.disable()
        mouseHandler.disable()
      }
    }
  }, [target])
}

export default GestureHandler