
enum QueueLimitBehaviour {
  SHIFT,
  DISCARD,
  ERROR
}

//##############################################################################
//#region                             QUEUE
//##############################################################################

export class Queue<T> {
  private items: T[]
  private limit: number
  private limitBehaviour: QueueLimitBehaviour

  /**
   * @param limit maximum number of items. If 0 or unset, no limit is
   *              applied.
   * @param onLimitReached behaviour when the element limit is exceeded.
   *        'shift' to remove oldest element, 'discard' to ignore new element,
   *        'error' to throw an Error
   */
  constructor(limit: number = 0, onLimitReached: 'shift'|'discard'|'error' = 'shift') {
    this.items = []
    this.limit = limit
    switch(onLimitReached) {
      case 'shift'    : this.limitBehaviour = QueueLimitBehaviour.SHIFT; break
      case 'discard' : this.limitBehaviour = QueueLimitBehaviour.DISCARD; break
      case 'error'   : this.limitBehaviour = QueueLimitBehaviour.ERROR; break
      default :
        throw Error(`Unexpected value for onLimitReached: ${onLimitReached}`)
    }
  }

  /**
   * Number of items in the queue.
   */
  get length(): number {
    return this.items.length
  }
  get empty(): boolean {
    return this.items.length === 0
  }
  get full(): boolean {
    return this.limit > 0 && this.length == this.limit
  }

  /**
   * Last inserted item in the queue.
   */
  get head(): T {
    const len = this.length
    if (len > 0)
        return this.items[len-1]
    else
        throw Error(`Cannot retrieve head element of empty queue`)
  }

  /**
   * Oldest item in the queue. Next to be removed
   */
  get tail(): T {
    if (this.items.length > 0)
        return this.items[0]
    else
      throw Error(`Cannot retrieve tail element of empty queue`)
  }

  /**
   * Get the page at the specified index in the buffer
   * @param index index of the page to get
   * @returns the page in the buffer at {@link index}
   */
  get(index: number): T {
    const len = this.items.length
    if (index < 0)
      index = len + index
    if (index >= len)
      throw Error(`Index (${index}) out of bound (quee length: ${len})`)
    return this.items[index]
  }
  indexOf(item: T, fromIndex: number = 0): number {
    if (fromIndex < 0)
      fromIndex = this.items.length + fromIndex
    return this.items.indexOf(item, fromIndex)
  }
  lastIndexOf(item: T, fromIndex: number = this.items.length-1): number {
    if (fromIndex < 0)
      fromIndex = this.items.length + fromIndex
    return this.items.lastIndexOf(item, fromIndex)
  }
  find(predicate: (item: T, index: number, queue: Queue<T>)=>boolean,
       fromIndex: number = 0, thisArg?: any) {
    const index = this.findIndex(predicate, fromIndex, thisArg)
    return index >= 0 ? this.items[index] : undefined
  }
  findIndex(predicate: (item: T, index: number, queue: Queue<T>)=>boolean,
            fromIndex: number = 0, thisArg?: any) {
    if (fromIndex < 0)
      fromIndex = this.items.length + fromIndex
    return this.items.slice(fromIndex).findIndex(
      (item, index)=>predicate(item, index+fromIndex, this), thisArg)
  }
  findLast(predicate: (item: T, index: number, queue: Queue<T>)=>boolean,
           fromIndex: number = this.length-1, thisArg?: any) {
    const index = this.findLastIndex(predicate, fromIndex, thisArg)
    return index >= 0 ? this.items[index] : undefined
  }
  findLastIndex(predicate: (item: T, index: number, queue: Queue<T>)=>boolean,
                fromIndex: number = 0, thisArg?: any) {
    if (fromIndex < 0)
      fromIndex = this.items.length + fromIndex
    return this.items.slice(fromIndex).findLastIndex(
      (item, index)=>predicate(item, index+fromIndex, this), thisArg)
  }
  all() {
    return this.items
  }
  slice(start:number = 0, end: number = this.items.length): Iterable<T> {
    const len = this.items.length
    if (start < 0) start = Math.max(0, len + start)
    if (end   < 0) end   = Math.max(0, len + end)
    if (start > len) return []
    if (end   > len) end = len
    return this.items.slice(start, end)
  }

  /**
   * Remove all items from the queue. Calls the listener.
   */
  clear() {
    this.items.splice(0)
  }

  /**
   * Append the element at the end of the queue.
   * If the limit is exceeded, remove the oldest pages
   * @param item element to insert
   * @returns this
   */
  push(item: T): typeof this {
    if (this.full) {
      switch(this.limitBehaviour) {
        case QueueLimitBehaviour.DISCARD: break
        case QueueLimitBehaviour.SHIFT :
          this.items.shift()
          this.items.push(item)
          break
        case QueueLimitBehaviour.ERROR :
          throw Error(`Unable to push element to the queue (limit reached)`)
      }
    } else {
      this.items.push(item)
    }
    return this
  }

  /**
   * Remove and return the most recent element in the queue
   * @returns the removed item
   */
  popHead(): T {
    const len = this.items.length
    if (len > 0) {
      return this.items.pop() as T
    } else {
      throw Error(`Queue is empty`)
    }
  }
  /**
   * Remove and return the oldest element in the queue
   * @returns the removed item
   */
  popTail(): T {
    const len = this.items.length
    if (len > 0) {
      return this.items.shift() as T
    } else {
      throw Error(`Queue is empty`)
    }
  }
  splice(start: number, end: number = this.items.length): T[] {
    const len = this.items.length
    if (start < 0) start = Math.max(0, len + start)
    if (end   < 0) end   = Math.max(0, len + end)
    if (start > len) return []
    if (end   > len) end = len
    return this.items.splice(start, end)
  }
  spliceHead(length: number): T[] {
    return this.splice(-Math.abs(length))
  }
  spliceTail(length: number): T[] {
    return this.splice(0, Math.abs(length))
  }

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]()
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
  async waitHead(): Promise<T> {
    if (this.length > 0) {
      return this.popHead()
    } else {
      return this.waitNextValue()
    }
  }
  async waitTail(): Promise<T> {
    if (this.length > 0) {
      return this.popTail()
    } else {
      return this.waitNextValue()
    }
  }
}
