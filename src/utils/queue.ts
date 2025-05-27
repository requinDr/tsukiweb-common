
enum QueueLimitBehaviour {
  SHIFT,
  DISCARD,
  ERROR
}

//##############################################################################
//#region                            BUFFER
//##############################################################################

abstract class Buffer<T> {
  private _items: T[]
  private _limit: number
  private _limitBehaviour: QueueLimitBehaviour

  /**
   * @param limit maximum number of items. If 0 or unset, no limit is
   *              applied.
   * @param onLimitReached behaviour when the element limit is exceeded.
   *        'shift' to remove oldest element, 'discard' to ignore new element,
   *        'error' to throw an Error
   */
  constructor(limit: number = 0, onLimitReached: 'shift'|'discard'|'error' = 'shift') {
    this._items = []
    this._limit = limit
    switch(onLimitReached) {
      case 'shift'    : this._limitBehaviour = QueueLimitBehaviour.SHIFT; break
      case 'discard' : this._limitBehaviour = QueueLimitBehaviour.DISCARD; break
      case 'error'   : this._limitBehaviour = QueueLimitBehaviour.ERROR; break
      default :
        throw Error(`Unexpected value for onLimitReached: ${onLimitReached}`)
    }
  }

  /**
   * Number of items in the buffer.
   */
  get length(): number { return this._items.length }

  get empty(): boolean { return this._items.length === 0 }

  get full(): boolean {
    return this._limit > 0 && this.length == this._limit
  }

  /**
   * Maximum items in the buffer, or 0 for unlimited items
   */
  get limit(): number { return this._limit }
  set limit(value: number) {
    this._limit = value
    const len = this.length
    if (value > 0 && value < len) {
      switch(this._limitBehaviour) {
        case QueueLimitBehaviour.DISCARD: this.trimHead(len - value); break
        case QueueLimitBehaviour.SHIFT : this.trimHead(len - value); break
        case QueueLimitBehaviour.ERROR :
          throw Error(`current item count exceeds new limit`)
      }
    }
  }

  protected trimHead(nbItems: number) {
    this._items.splice(this._items.length - nbItems)
  }
  protected trimTail(nbItems: number) {
    this._items.splice(0, nbItems)
  }
  protected popHead() {
    return this._items.pop()
  }
  protected popTail() {
    return this._items.shift()
  }

  get(index: number) {
    return this._items.at(index)
  }

  indexOf(item: T, fromIndex: number = 0): number {
    if (fromIndex < 0)
      fromIndex = this._items.length + fromIndex
    return this._items.indexOf(item, fromIndex)
  }
  lastIndexOf(item: T, fromIndex: number = this._items.length-1): number {
    if (fromIndex < 0)
      fromIndex = this._items.length + fromIndex
    return this._items.lastIndexOf(item, fromIndex)
  }
  find(predicate: (item: T, index: number, buffer: this)=>boolean,
       fromIndex: number = 0, thisArg?: any) {
    const index = this.findIndex(predicate, fromIndex, thisArg)
    return index >= 0 ? this._items[index] : undefined
  }
  findIndex(predicate: (item: T, index: number, buffer: this)=>boolean,
            fromIndex: number = 0, thisArg?: any) {
    if (fromIndex < 0)
      fromIndex = this._items.length + fromIndex
    return this._items.slice(fromIndex).findIndex(
      (item, index)=>predicate(item, index+fromIndex, this), thisArg)
  }
  findLast(predicate: (item: T, index: number, buffer: this)=>boolean,
           fromIndex: number = this.length-1, thisArg?: any) {
    const index = this.findLastIndex(predicate, fromIndex, thisArg)
    return index >= 0 ? this._items[index] : undefined
  }
  findLastIndex(predicate: (item: T, index: number, buffer: this)=>boolean,
                fromIndex: number = 0, thisArg?: any) {
    if (fromIndex < 0)
      fromIndex = this._items.length + fromIndex
    return this._items.slice(fromIndex).findLastIndex(
      (item, index)=>predicate(item, index+fromIndex, this), thisArg)
  }

  all() {
    return this._items
  }

  /**
   * Remove all items from the queue. Calls the listener.
   */
  clear() {
    this._items.splice(0)
  }
  
  slice(start:number = 0, end: number = this._items.length): Iterable<T> {
    const len = this._items.length
    if (start < 0) start = Math.max(0, len + start)
    if (end   < 0) end   = Math.max(0, len + end)
    if (start > len) return []
    if (end   > len) end = len
    return this._items.slice(start, end)
  }
  
  splice(start: number, end: number = this._items.length): T[] {
    const len = this._items.length
    if (start < 0) start = Math.max(0, len + start)
    if (end   < 0) end   = Math.max(0, len + end)
    if (start > len) return []
    if (end   > len) end = len
    return this._items.splice(start, end)
  }

  push(...items: T[]): this {
    for (const item of items) {
      if (this.full) {
        switch(this._limitBehaviour) {
          case QueueLimitBehaviour.DISCARD: break
          case QueueLimitBehaviour.SHIFT :
            this.trimTail(1)
            this._items.push(item)
            break
          case QueueLimitBehaviour.ERROR :
            throw Error(`Unable to push element to the queue (limit reached)`)
        }
      } else {
        this._items.push(item)
      }
    }
    return this
  }

  abstract pop(): T

  [Symbol.iterator]() {
    return this._items[Symbol.iterator]()
  }
}

//#endregion ###################################################################
//#region                             QUEUE
//##############################################################################

export class Queue<T> extends Buffer<T> {

  /**
   * Last inserted item in the queue.
   */
  get head(): T {
    if (!this.empty)
        return this.get(-1) as T
    else
        throw Error(`Cannot retrieve head element of an empty queue`)
  }

  /**
   * Oldest item in the queue. Next to be removed
   */
  get tail(): T {
    if (!this.empty)
        return this.get(0) as T
    else
      throw Error(`Cannot retrieve tail element of an empty queue`)
  }

  /**
   * Remove and return the oldest element in the queue
   * @returns the removed item
   */
  override pop(): T {
    if (this.empty)
      throw Error("The queue is empty")
    return this.popTail() as T
  }
}

//#endregion ###################################################################
//#region                             STACK
//##############################################################################

export class Stack<T> extends Buffer<T> {

  /**
   * Last inserted item in the stack.
   */
  get top() {
    if (!this.empty)
      return this.get(-1) as T
    else
      throw Error(`Cannot retrieve top element of an empty stack`)
  }

  /**
   * Remove and return the latest inserted element in the queue
   * @returns the removed item
   */
  override pop(): T {
    if (this.empty)
      throw Error("The stack is empty")
    return this.popHead() as T
  }

}

//#endregion ###################################################################
//#region                          ASYNC QUEUE
//##############################################################################

export class AsyncQueue<T> extends Queue<T> {
  private _resolve: ((value: T)=> void) | null = null;
  private _reject: ((reason?: any) => void) | null = null;
  
  /**
   * @return `true` if the reader is waiting for a new value (the queue is empty)
   */
  get waiting() : boolean {
    return this._resolve != null;
  }

  /**
   * if the previous read operation has not been resolved, this function rejects it
   */
  cancelRead() {
    if(this._reject != null)
      this._reject()
  }

  push(item: T): this {
    if (this._resolve) {
      this._resolve(item)
      this._resolve = null
      return this
    } else {
      return this.push(item)
    }
  }
  private async waitNextValue(): Promise<T> {
    this.cancelRead();
    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject
    });
  }
  async read(): Promise<T> {
    if (this.length > 0) {
      return this.pop()
    } else {
      return this.waitNextValue()
    }
  }
}
