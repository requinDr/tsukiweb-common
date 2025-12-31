import { useEffect, useState } from "react"

type ObserverCallback<T, K extends keyof T> = (value: T[K], key: K, obj: T)=>void
type Observable = Record<PropertyKey, any>

type Listener<T, K extends keyof T> = {
  callback: ObserverCallback<T, K>
  once: boolean
  filter?: (value: T[K], key: K, obj: T)=>boolean
}
type ObserverOptions<T, K extends keyof T> = Partial<Omit<Listener<T, K>, 'callback'>>
type ObserverHookOptions<T, K extends keyof T> = Omit<ObserverOptions<T, K>, 'once'> & (
  { once?: false, skipFirst?: boolean } |
  { once: true, skipFirst?: false })

type ChildrenListener<T> = {
  callback: (prop: keyof T, val: any)=>void
  filter?: (prop: keyof T, v: T[keyof T])=>boolean
}
type ChildrenObserverOptions<T> = Partial<Omit<ChildrenListener<T>, 'callback'>>

//##############################################################################
//#region                        OBSERVER CLASSES
//##############################################################################

class PropertyObserver<T, K extends keyof T> {
  private originalDescriptor: PropertyDescriptor
  private changed: boolean
  private listeners: Array<Listener<T, K>>
  private key: K
  private parent: T

  constructor(parent: T, property: K, onValueChange: VoidFunction) {
    this.parent = parent
    this.key = property
    let descriptor = Object.getOwnPropertyDescriptor(parent, property)
    let proto = Object.getPrototypeOf(parent)
    while (!descriptor && proto.constructor != Object) {
      descriptor = Object.getOwnPropertyDescriptor(proto, property)
      proto = Object.getPrototypeOf(proto)
    }
    if (!descriptor)
      throw Error(`property ${property.toString()} is not a property of object ${parent}`)
    descriptor = Object.seal(descriptor)
    if (!(descriptor.configurable && (descriptor.writable??true)))
      throw Error(`property ${property.toString()} of ${parent} must be configurable and writable to be observed`)
    if ((descriptor.get != undefined) != (descriptor.set != undefined))
      throw Error(`property ${property.toString()} of ${parent} must be writeable and readable`)

    this.originalDescriptor = descriptor
    this.changed = false
    this.listeners = []
    const self = this
    Object.defineProperty(parent, property, {
      get() { return descriptor.get?.call(this)??descriptor.value },
      set(v: T[K]) {
        const oldValue = this[property]
        if (descriptor.set)
          descriptor.set.call(this, v)
        else
          descriptor.value = v
        if (v != oldValue && !self.changed) {
          self.changed = true
          onValueChange()
        }
      },
      enumerable: descriptor.enumerable,
      configurable: true
    })
  }
  get modified() {
    return this.changed
  }
  simulateChange() {
    this.changed = true
  }
  notifyChange(value : T[K]) {
    this.changed = false
    const listeners = this.listeners.filter(({filter})=>filter?.(value, this.key, this.parent)??true)
    for (const listener of listeners) {
      listener.callback(value, this.key, this.parent)
      if (listener.once)
        this.listeners.splice(this.listeners.indexOf(listener), 1)
    }
    return this.listeners.length == 0
  }
  addListener(callback: ObserverCallback<T, K>, {filter=undefined, once=false}: ObserverOptions<T, K>) {
    this.listeners.push({callback, filter, once})
  }
  removeListener(callback: ObserverCallback<T, K>) {
    let index = this.listeners.findIndex(listener=>listener.callback == callback)
    if (index >= 0) {
      this.listeners.splice(index, 1)
      return this.listeners.length
    } else {
      return -1
    }
  }
  stopObserver(parent: any, property: PropertyKey) {
    Object.defineProperty(parent, property, this.originalDescriptor)
  }
}

const observerSymbol = Symbol("Observer")

const notifyTask = {
  _list: [] as Array<VoidFunction>,
  _microtaskQueued: false,
  _microtask() {
    notifyTask._microtaskQueued = false
    for (const func of notifyTask._list) {
      func()
    }
    notifyTask._list = []
  },
  enqueue(func: VoidFunction) {
    this._list.push(func)
    if (!this._microtaskQueued) {
      this._microtaskQueued = true
      queueMicrotask(this._microtask)
    }
  }
}

class PropertiesObserver<T extends Observable> {

  private observers: Map<keyof T, PropertyObserver<T, any>>
  private parent: T
  private notifyQueued: boolean
  private onValueChange: VoidFunction
  private notify: VoidFunction

  static getObserver<T extends Observable>(parent: T|ObservableContainer<T>, create:true) : PropertiesObserver<T>;
  static getObserver<T extends Observable>(parent: T|ObservableContainer<T>, create:false) : PropertiesObserver<T>|undefined;
  static getObserver<T extends Observable>(parent: T|ObservableContainer<T>, create=false) : PropertiesObserver<T>|undefined {
    if (observerSymbol in parent) {
      return parent[observerSymbol] as PropertiesObserver<T>
    } else if (create) {
      const observer = new PropertiesObserver(parent);
      (parent as any)[observerSymbol] = observer
      return observer as PropertiesObserver<T>
    } else {
      return undefined
    }
  }

  private constructor(parent: T) {
    this.observers = new Map()
    this.parent = parent
    this.notifyQueued = false
    this.onValueChange = this._onValueChange.bind(this)
    this.notify = this._notify.bind(this)
  }

  private _onValueChange() {
    if (!this.notifyQueued) {
      notifyTask.enqueue(this.notify)
      this.notifyQueued = true
    }
  }

  private _notify() {
    this.notifyQueued = false
    for (const [property, observer] of this.observers.entries()) {
      if (observer.modified) {
        const empty = observer.notifyChange(this.parent[property])
        if (empty) {
          observer.stopObserver(this.parent, property)
          this.observers.delete(property)
          this.onSizeChanged()
        }
      }
    }
  }

  private getObserver<K extends keyof T>(prop: K): PropertyObserver<T, K> {
    if (!this.observers.has(prop)) {
      const observer = new PropertyObserver<T, K>(this.parent, prop,
          this.onValueChange)
      this.observers.set(prop, observer)
    }
    return this.observers.get(prop) as PropertyObserver<T, K>
  }

  private onSizeChanged() {
    if (this.observers.size == 0)
      delete this.parent[observerSymbol]
  }

  observe<K extends keyof T>(property: K, callback: ObserverCallback<T, K>,
      options: ObserverOptions<T, K> = {}) {
    this.getObserver(property).addListener(callback, options)
  }

  unobserve<K extends keyof T>(property: K, callback: ObserverCallback<T, K>) {
    const observer = this.getObserver(property)
    const remainingListeners = observer.removeListener(callback)
    if (remainingListeners == 0) {
      observer.stopObserver(this.parent, property)
      this.observers.delete(property)
      this.onSizeChanged()
    }
  }

  simulateChange<K extends keyof T>(property: K) {
    const observer = this.observers.get(property)
    if (observer) {
      observer.simulateChange()
      this._onValueChange()
    }
  }

  notifyObservers<K extends keyof T>(property: K) {
    const observer = this.observers.get(property)
    if (observer) {
      const empty = observer.notifyChange(this.parent[property])
      if (empty) {
        observer.stopObserver(this.parent, property)
        this.observers.delete(property)
        this.onSizeChanged()
      }
    }
  }

  notifyPending<K extends keyof T>(property: K) {
    const observer = this.observers.get(property)
    return observer?.modified
  }
}

const callbacksSymbol = Symbol("callbacks")
const hiddenObjSymbol = Symbol("hidden object")

class ObservableContainer<T extends Object> {
  constructor(obj: T) {
    const callbacks : Array<ChildrenListener<T>> = []
    const modifs: [(keyof T), T[keyof T]][] = []
    let notifyQueued = false
    const notify = ()=> {
      notifyQueued = false
      for (const [key, value] of modifs) {
        for (const {callback, filter} of callbacks) {
          if (filter?.(key as keyof T, value) ?? true)
            callback(key as keyof T, value)
        }
      }
    }
    return new Proxy(obj, {
      //...Reflect,
      get(target, key: PropertyKey, receiver) {
        switch(key) {
          case callbacksSymbol: return callbacks
          case hiddenObjSymbol: return obj
          default : return Reflect.get(target, key, receiver)
        }
      },
      set(target, key: PropertyKey, value, receiver) {
        const diff = value != Reflect.get(target, key, receiver)
        const result = Reflect.set(target, key, value, receiver)
        if (diff && result) {
          modifs.push([key as keyof T, value])
          if (!notifyQueued) {
            notifyTask.enqueue(notify)
          }
        }
        return result
      }
    })
  }
}

//#endregion ###################################################################
//#region                     PUBLIC BASE FUNCTIONS
//##############################################################################

/**
 * Listen for changes of a property in the specified object.
 * @param object the object with the property to observe
 * @param property the property to observe in the object. Must be the object's
 *        own property, configurable and writable
 * @param callback the function to call when the property has changed
 * @param options.filter if specified, called before the callback.
 *        If it returns false, the callback function is not called.
 * @param options.once if true, the callback will be removed after the first
 *        call
 */
export function observe<T extends Observable, P extends keyof T>(
    object: T|ObservableContainer<T>, property: P,
    callback: ObserverCallback<T, P>, options: ObserverOptions<T, P> = {}) {
  const observer = PropertiesObserver.getObserver<T>(object, true)
  observer.observe(property, callback, options)
}

/**
 * Stops Listening for changes of the property.
 *
 * All parameters must be the same as when calling the `observe` function
 */
export function unobserve<T extends Observable, P extends keyof T>
    (object: T|ObservableContainer<T>, property: P,
    callback: ObserverCallback<T, P>): boolean {
  const observer = PropertiesObserver.getObserver(object, false)
  return observer?.unobserve(property, callback) ?? false
}

/**
 * Notify all listeners (call the callbacks) with the current value of the specified property
 */
export function notifyObservers<T extends Observable>(object: T, property: keyof T) {
  if (object[observerSymbol])
    notifyTask.enqueue(object[observerSymbol].notifyObservers.bind(object[observerSymbol], property))
}

export function simulateObserverChange<T extends Observable>(object: T, property: keyof T) {
  if (object[observerSymbol])
    (object[observerSymbol] as PropertiesObserver<T>).simulateChange(property)
}

export function isObserverNotifyPending<T extends Observable>(object: T, property: keyof T) {
  const observer = PropertiesObserver.getObserver<T>(object, false)
  return observer?.notifyPending(property) ?? false
}

/**
 * Listen for changes of all properties in the specified object.
 * If the attribute is not yet observed, its descriptor is changed to enable the observation
 * of value changes.
 * @param parent parent of the object to observe
 * @param attr name of the object to observe in the parent.
 * @param callback the function to call when the property has changed
 * @param options.filter if specified, called before the callback.
 *        If it returns false, the callback function is not called
 */
export function observeChildren<T extends Record<string, any>, K extends keyof T>(parent: T, attr: K,
    callback: ChildrenListener<T[K]>['callback'],
    options: ChildrenObserverOptions<T[K]> = {}) {
  if (!(callbacksSymbol in parent[attr])) {
    parent[attr] = new ObservableContainer(parent[attr]) as any
  }
  const callbacks = parent[attr][callbacksSymbol as keyof ObservableContainer<T[K]>] as ChildrenListener<T[K]>[]
  callbacks.push({callback, ...options})
}

/**
 * Remove the callback from the observers of the specified attribute.
 * If the attribute is not observed anymore, it is restored to its original descriptor.
 * @param parent object whose attribute must be un-observed
 * @param attr name of the attribute to un-observe
 * @param callback callback to remove the from registered observers
 * @returns true if the operation was successful, false if the callback was not registered
 */
export function unobserveChildren<T extends Object>(parent: T, attr: keyof T,
    callback: ChildrenListener<T[any]>['callback']): boolean {
  const callbacks = parent[attr][callbacksSymbol as keyof ObservableContainer<T>] as ChildrenListener<T>[]
  const index = callbacks?.findIndex(listener=> listener.callback = callback)??-1
  if (index == -1)
    return false
  callbacks.splice(index, 1)
  if (callbacks.length == 0)
    parent[attr] = parent[attr][hiddenObjSymbol as keyof ObservableContainer<T>]
  return true
}

export function observeMultiple<T extends Object, K extends keyof T>(object: T,
    attrs: Iterable<K>, callback: ObserverCallback<T, K>,
    options: ObserverOptions<T, K> = {}) {
  const observer = PropertiesObserver.getObserver<T>(object, true)
  for (const attr of attrs)
    observer.observe(attr, callback, options)
}
export function unobserveMultiple<T extends Object, K extends keyof T>(object: T,
    attrs: Iterable<K>, callback: ObserverCallback<T, K>) {
  const observer = PropertiesObserver.getObserver(object, false)
  if (!observer)
    return false
  for (const attr of attrs)
    observer.unobserve(attr, callback)
  return true
}

//#endregion ###################################################################
//#region                      REACT-HOOK FUNCTIONS
//##############################################################################

/**
 * Exploit the functions {@link useEffect} from react and {@link observe} to
 * call the callback function for every change in the value of the specified attribute.
 * @param callback the function to call when the attribute's value has changed
 * @param object parent of the attribute to observe
 * @param property name of the attribute
 * @param options see {@link observe} for details on the available options
 */
export function useObserver<T extends Observable, P extends keyof T>(
    callback: ObserverCallback<T, P>, object: T|ObservableContainer<T>, property: P,
    options: ObserverHookOptions<T, P> = {}) {
  useEffect(()=> {
    observe(object as T, property, callback, options)
    const val = (object as T)[property]
    if (!options.skipFirst && !options.once && (options.filter?.(val, property, object as T) ?? true)) {
      callback(val, property, object as T)
    }
    return unobserve.bind(null, object, property, callback as any) as VoidFunction
  }, [object])
}

/**
 * Exploit the functions {@link useState} from react and {@link useObserver} to
 * create a hook state that is updated when the observed attribute changes.
 * If a {@link map} function is provided, it will be called to convert the observed attribute.
 * If a {@link map} is provided, an {@link invMap} function must also be provided to use the setter.
 * It will convert the state's value back to update the attribute.
 * @param object parent of the attribute to observe
 * @param property name of the attribute to observe
 * @param map function that maps the attribute value to the state variable
 * @param invMap function that maps the state variable to the attribute, used for the setter
 * @returns the state variable and its setter if available
 */
export function useObserved<V extends never,T extends Observable, P extends keyof T>(
    object: T|ObservableContainer<T>, property: P, map?: never, invMap?: never): [T[P], (v:T[P])=>void];
export function useObserved<V,T extends Observable, P extends keyof T>(
    object: T|ObservableContainer<T>, property: P, map: (v:T[P], curr?: V)=>V, invMap?: never): [V];
export function useObserved<V,T extends Observable, P extends keyof T>(
    object: T|ObservableContainer<T>, property: P, map: (v:T[P], curr?: V)=>V, invMap: (v: V, curr: T[P])=> T[P]) : [V, (v:V)=>void];
export function useObserved<V,T extends Observable, P extends keyof T>(
    object: T|ObservableContainer<T>, property: P, map?: (v:T[P], curr?: V)=>V, invMap?: (v: V, curr: T[P])=> T[P]) : [V|T[P], (v:V|T[P])=>void]
export function useObserved<V,T extends Observable, P extends keyof T>(
    object: T|ObservableContainer<T>, property: P, map?: (v:T[P], curr?: V)=>V, invMap?: (v: V, curr: T[P])=> T[P]) {
    const currentValue = (object as T)[property]
  if (map) {
    const [value, setValue] = useState<V>(map(currentValue))
    useObserver((v:T[P])=> {setValue(map(v, value))}, object, property)
    if (invMap)
      return [value, (v: V)=> {(object as T)[property] = (invMap(v, (object as T)[property]))}]
    else
      return [value]
  } else {
    const [value, setValue] = useState<T[P]>(currentValue)
    useObserver(setValue, object, property)
    return [value, (v: T[P])=> { (object as T)[property] = v }]
  }
}

/**
 * Exploit the functions {@link useEffect} from react and {@link observeChildren} to
 * call the callback function for every change in any attribute of the specified object
 * @param callback the function to call when the attribute's value has changed
 * @param parent parent of the object whose attributes will be observed
 * @param property name of object to observe in the parent object
 * @param options see {@link observeChildren} for details on the available options
 */

export function useChildrenObserver<T extends Object, K extends keyof T>(
    callback: ChildrenListener<T[K]>['callback'], parent: T, attr: K,
    options: ChildrenObserverOptions<T[K]> = {}) {
  useEffect(()=> {
    observeChildren(parent, attr, callback, options)
    return unobserveChildren.bind(null, parent, attr as any, callback as any) as VoidFunction
  }, [])
}

//#endregion ###################################################################