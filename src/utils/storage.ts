import { JSONObject, NoMethods, PartialJSON, RecursivePartial } from "@tsukiweb-common/types";
import { deepAssign, jsonDiff, jsonMerge } from "./utils";

export abstract class Stored {
  #storage: Storage
  #storageName: string

  constructor(name: string, session: boolean, saveOnBlur: boolean = false) {
    this.#storage = session ? sessionStorage : localStorage
    this.#storageName = name
    if (saveOnBlur) {
      document.addEventListener("visibilitychange", ()=> {
        if (document.visibilityState == "hidden") {
          this.saveToStorage()
        }
      })
    }
  }

  protected saveToStorage() {
    const data = this.serializeToStorage()
    if (data == null)
      this.deleteStorage()
    else
      this.#storage.setItem(this.#storageName, data)
  }

  protected restoreFromStorage() {
    const storedStr = this.#storage.getItem(this.#storageName)
    if (storedStr !== null)
      this.deserializeFromStorage(storedStr)
  }
  
  deleteStorage() {
    this.#storage.removeItem(this.#storageName)
  }
  
  storageExists(): boolean {
    return this.#storage.getItem(this.#storageName) !== null
  }

  protected abstract serializeToStorage(): string|null
  protected abstract deserializeFromStorage(str: string): void

}

export class StoredJSON extends Stored {

  #diffRef?: NoMethods<this>
  #attributes?: (keyof NoMethods<this>)[]

  protected listAttributes(refresh: boolean = false): (keyof NoMethods<this>)[] {
    if (refresh || !this.#attributes) {
      let jsonAttrs = []
      let obj = this
      while (obj.constructor != StoredJSON) {
        let attrs = Object.keys(obj)
        for (let attr of attrs) {
          const desc = Object.getOwnPropertyDescriptor(obj, attr)
          if (!(desc!.get || desc!.set) && desc!.writable
              && !(desc!.value instanceof Function))
            jsonAttrs.push(attr)
        }
        obj = Object.getPrototypeOf(obj)
      }
      this.#attributes = jsonAttrs as (keyof NoMethods<this>)[]
    }
    return this.#attributes
  }

  setDiffReference(obj: Readonly<NoMethods<this>>) {
    this.#diffRef = deepAssign({}, obj)
  }

  setAsDiffReference() {
    this.setDiffReference(Object.fromEntries(
      this.listAttributes().map(key=>[key, this[key]])
    ) as unknown as NoMethods<this>)
  }
  getReference(): Readonly<NoMethods<this>>|undefined {
    return this.#diffRef
  }

  getDiff() {
    let obj = this.convertToJSONObject()
    if (this.#diffRef)
      obj = jsonDiff(obj, this.#diffRef as JSONObject) as JSONObject
    return obj
  }

  fromDiff(diff: JSONObject | PartialJSON) {
    if (this.#diffRef)
      diff = jsonMerge(diff, this.#diffRef)
    deepAssign(this, diff)
  }

  protected convertToJSONObject(): JSONObject {
    const attrs = this.listAttributes()
    const entries = attrs.map(key=>[key, this[key]])
    return Object.fromEntries(entries) as JSONObject
  }

  protected serializeToStorage(): string|null {
    return JSON.stringify(this.getDiff())
  }

  protected deserializeFromStorage(str: string): void {
    this.fromDiff(JSON.parse(str))
  }
}

export class ValueStorage<T> extends Stored {
  private _val: T|undefined
  private _stringify: (v: T) => string|null
  private _parse: (v: string) => T

  constructor(name: string, session: boolean,
              stringify: (v: T)=> string|null, parse: (v: string)=> T,
              onBlur?: ()=>(T|undefined|void)) {
    super(name, session, onBlur != undefined)
    this._stringify = stringify
    this._parse = parse
    this._val = undefined
  }

  set(value: T) {
    this._val = value
    this.saveToStorage()
    this._val = undefined
  }

  get(): T | undefined {
    this.restoreFromStorage()
    const value = this._val
    this._val = undefined
    return value
  }

  protected override serializeToStorage(): string | null {
    return this._stringify(this._val!)
  }
  protected override deserializeFromStorage(str: string): void {
    this._val = this._parse(str)
  }
}