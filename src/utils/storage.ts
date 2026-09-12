import { JSONObject, NoMethods, PartialJSON } from "../types";
import { deepAssign, jsonDiff, jsonMerge } from "./utils";

type DirPickerWindow = Window & typeof globalThis & {
  /**
   * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
   */
  showDirectoryPicker: (
    opts:{id?: string, mode?: string, startIn?: FileSystemHandle|string}
    ) => Promise<FileSystemDirectoryHandle>
}

//##############################################################################
//#region                       Resource Managers
//##############################################################################

export abstract class ResourceManager {

  abstract has(id: string): Promise<boolean>
  /**
   * Load the specified resource as a {@link Response}
   * @param id identifier of the resource to load
   */
  abstract getResponse(id: string): Promise<Response>

  async getStream(id: string): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    return (await this.getResponse(id)).body!
  }
  async getBlob(id: string): Promise<Blob> {
    return (await this.getResponse(id)).blob()
  }
  async getBytes(id: string): Promise<Uint8Array<ArrayBuffer>> {
    return (await this.getResponse(id)).bytes()
  }
  async getText(id: string): Promise<string> {
    return (await this.getResponse(id)).text()
  }
  async getJSON(id: string, reviver?: Parameters<typeof JSON.parse>[1]): Promise<JSONObject> {
    return JSON.parse(await this.getText(id), reviver)
  }
  async getUri(id: string): Promise<string> {
    const reader = new FileReader()
    return new Promise<string>(async r=> {
      reader.onload = ()=>r(reader.result as string)
      reader.readAsDataURL(await this.getBlob(id))
    })
  }

  abstract setResponse(id: string, response: Response): Promise<void>

  async setStream(id: string, stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
    return this.setResponse(id, new Response(stream))
  }
  async setBlob(id: string, blob: Blob) {
    return this.setResponse(id, new Response(blob))
  }
  async setBytes(id: string, bytes: Uint8Array<ArrayBuffer>) {
    return this.setResponse(id, new Response(bytes))
  }
  async setText(id: string, text: string) {
    return this.setResponse(id, new Response(text))
  }
  async setJSON(id: string, obj: JSONObject,
                replacer?: Parameters<typeof JSON.stringify>[1],
                space?: Parameters<typeof JSON.stringify>[2]) {
    return this.setText(id, JSON.stringify(obj, replacer, space))
  }
  abstract delete(id: string): Promise<void>
  abstract clear(): Promise<void>
}

export abstract class FSResourceManager extends ResourceManager {

  protected abstract createRoot(): Promise<FileSystemDirectoryHandle|null>

  private _root: FileSystemDirectoryHandle|null = null
  private _fileCache = new Map<string, WeakRef<FileSystemFileHandle>>()
  private _dirCache = new Map<string, WeakRef<FileSystemDirectoryHandle>>()
  private _getPath: (id: string)=>string|null

  constructor(getPath: (id: string)=>string|null) {
    super()
    this._getPath = getPath
  }

  async open(): Promise<boolean> {
    this._root = await this.createRoot()
    return this._root != null
  }

  isOpen(): boolean {
    return this._root != null
  }

  protected async getRoot() {
    if (this._root == null)
      await this.open()
    return this._root
  }

  private async getFolder(path: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle|null> {
    const subDirectories = []
    while (path.length > 0 && !this._dirCache.has(path)) {
      let i=path.lastIndexOf('/')
      subDirectories.push(path.substring(i+1))
      path = path.substring(0, i)
    }
    let dir = this._dirCache.get(path)?.deref() ?? await this.getRoot()
    if (!dir)
      return null
    for (const subDir of subDirectories) {
      path += `/${subDir}`
      dir = await dir!.getDirectoryHandle(subDir, options)
      this._dirCache.set(path, new WeakRef(dir))
    }
    return dir
  }

  protected async getFile(path: string, create = false): Promise<FileSystemFileHandle|null> {
    const cache = this._fileCache.get(path)
    if (cache) {
      const file = cache.deref()
      if (file)
        return file
    }
    try {
      let dir = await this.getRoot()
      if (dir == null)
        return null
      const opts = {create}
      let i = path.lastIndexOf('/')
      let dirName: string,
          fileName: string;
      if (i>= 0) {
        dirName = path.substring(0, i)
        fileName = path.substring(i+1)
        dir = await this.getFolder(dirName, opts)
      } else {
        fileName = path
        dir = await this.getRoot()
      }
      const file = await (await this.getRoot())?.getFileHandle(fileName, opts)
      if (file)
        this._fileCache.set(path, new WeakRef(file))
      return file ?? null
    } catch (e) {
      return null
    }
  }
  
  override async has(id: string) {
    const path = this._getPath(id)
    if (!path) return false
    try {
      this.getFile(path)
      return true
    } catch {
      return false
    }
  }

  override async getResponse(id: string) {
    return new Response(await (await this.getFile(this._getPath(id)!))!.getFile())
  }
  override async setResponse(id: string, response: Response) {
    this.setStream(id, response.body!)
  }
  private async createWritable(id: string) {
    return (await this.getFile(this._getPath(id)!, true))!.createWritable()
  }
  override async setBlob(id: string, blob: Blob) {
    const writable = await this.createWritable(id)
    writable.write(blob)
  }
  override async setStream(id: string, stream: ReadableStream) {
    const writable = await this.createWritable(id)
    const writer = writable.getWriter()
    await writer.ready
    writer.write(stream)
    //writer.releaseLock()
    writer.close()
  }
  override async delete(id: string) {
    const path = this._getPath(id)
    if (!path) return
    let i = path.lastIndexOf('/')
    let fileName, dirName, dir
    try {
      if (i >= 0) {
        fileName = path.substring(i+1)
        dirName = path.substring(0, i)
        dir = await this.getFolder(dirName)
      } else {
        fileName = path
        dir = await this.getRoot()
      }
      dir?.removeEntry(fileName)
      this._fileCache.delete(path)
    } catch { }
  }
  override async clear() {
    const root = await this.getRoot()
    const entries = root?.entries()
    if(!entries)
      return
    for await (const [name, handle] of entries) {
      root?.removeEntry(name, {recursive: true})
    }
  }
}

export class UserFSResourceManager extends FSResourceManager {
  private _userDirId: string|undefined
  private _mode: string
  constructor(getPath: (id: string)=>string|null,
              mode: 'readonly'|'readwrite',
              userDirectoryId?: string) {
    super(getPath)
    this._userDirId = userDirectoryId
    this._mode = mode
  }

  static isAvailable(global: typeof window): global is DirPickerWindow {
    return ('showDirectoryPicker' in window)
  }
  protected override async createRoot() {
    if (UserFSResourceManager.isAvailable(window)) {
      try {
        const directoryHandle = await window.showDirectoryPicker({
            id: this._userDirId,
            mode: this._mode ,
            startIn: "documents"
          })
        return directoryHandle
      } catch (e) {
        console.error(`User aborted directory picker`, e)
        return null
      }
    } else {
      console.error(`Directory picker not available`)
      return null
    }
  }
}

export class OPFSResourceManager extends FSResourceManager {
  protected override async createRoot() {
    return navigator.storage.getDirectory()
  }
  async persist() {
    return navigator.storage.persist()
  }
  async persisted() {
    return navigator.storage.persisted()
  }
}

export class LocalStorageResourceManager extends ResourceManager {
  private _storage: Storage
  constructor(session: boolean) {
    super()
    this._storage = session ? sessionStorage : localStorage
  }
  override async has(id: string) {
    const n = this._storage.length
    for (let i =0; i < n; i++) {
      if (this._storage.key(i) == id)
        return true
    }
    return false
  }
  override async getText(id: string) {
    return this._storage.getItem(id)!
  }
  override async getResponse(id: string) {
    return new Response(this._storage.getItem(id)!)
  }
  override async setText(id: string, text: string) {
    this._storage.setItem(id, text)
  }
  override async setResponse(id: string, response: Response) {
    this.setText(id, await response.text())
  }
  override async delete(id: string) {
    this._storage.removeItem(id)
  }
  override async clear() {
    this._storage.clear()
  }
}

export class IDBResourceManager extends ResourceManager {
  private _dbName: string
  private _db: IDBDatabase|null
  private _onUpgrade: (db: IDBDatabase)=>void
  private _getLocation: (id: string)=>[store: string, key: string]|null
  private _index: Map<string, Array<string>>

  constructor(dbName: string, onUpgrade: (db: IDBDatabase)=>void,
              getLocation: (id: string)=>[store: string, key: string]|null) {
    super()
    this._dbName = dbName
    this._db = null
    this._onUpgrade = onUpgrade
    this._getLocation = getLocation
    this._index = new Map()
  }
  async open() {
    try {
      if (!this._db) {
        this._db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(this._dbName, 1)
          request.onupgradeneeded = () => this._onUpgrade(request.result)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve(request.result)
        })
      }
      return true
    } catch (e) {
      console.error(`Unable to open database`, e)
      return false
    }
  }
  isOpen() {
    return this._db != null
  }

  async close() {
    this._db?.close()
    this._db = null
  }

  updateIndex(...stores: string[]) {
    try {
      if (!this.open())
        throw Error(`Unable to open database`)
      return new Promise<void>((resolve, reject)=> {
        const transaction = this._db!.transaction(stores, 'readonly')
        const requests = new Map<string, IDBRequest<IDBValidKey[]>>()
        for (const storeName of stores) {
          const store = transaction.objectStore(storeName)
          const keys = store.getAllKeys()
          requests.set(storeName, keys)
        }
        transaction.oncomplete = () => {
          for (const [storeName, req] of requests.entries()) {
            this._index.set(storeName, Array.from(req.result, k=>k.toString()))
          }
          resolve()
        }
        transaction.onabort = ()=> reject(transaction.error!)
      })
    } finally {
      this.close()
    }
  }

  override async has(id: string) {
    const location = this._getLocation(id)
    if (!location)
      return false
    const [storeName, key] = location
    if (!this._index.has(storeName)) {
      this.updateIndex(storeName)
      if (!this._index.has(storeName))
        return false
    }
    return this._index.get(storeName)!.includes(key)
  }

  override async getBlob(id: string) {
    const [storeName, key] = this._getLocation(id)!
    try {
      if (!this.open())
        throw Error(`Unable to open database`)
      return new Promise<any>((resolve, reject) => {
        const transaction = this._db!.transaction(storeName, 'readonly')
        const store = transaction.objectStore(storeName)
        const value = store.get(key)
        transaction.oncomplete = () => resolve(value.result)
        transaction.onabort = () => reject(transaction.error!)
      })
    } finally {
      this.close()
    }
  }
  override async getResponse(id: string) {
    return new Response(await this.getBlob(id))
  }
  override async setBlob(id: string, data: Blob) {
    const [storeName, key] = this._getLocation(id)!
    try {
      if (!this.open())
        throw Error(`Unable to open database`)
      await new Promise<any>((resolve, reject) => {
        const transaction = this._db!.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        transaction.oncomplete = resolve
        transaction.onabort = () => reject(transaction.error!)
        try {
          store.put(data, key)
        } catch (e) {
          reject(e)
          transaction.abort()
        }
      })
    } finally {
      this.close()
    }
  }

  override async setResponse(id: string, response: Response) {
    return this.setBlob(id, await response.blob())
  }

  override async delete(id: string) {
    const [storeName, key] = this._getLocation(id)!
    try {
      if (!this.open())
        throw Error(`Unable to open database`)
      await new Promise((resolve, reject)=> {
        const transaction = this._db!.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        transaction.oncomplete = resolve
        transaction.onabort = () => reject(transaction.error!)
        try {
          store.delete(key)
        } catch (e) {
          reject(e)
          transaction.abort()
        }
      })
    } finally {
      this.close()
    }
  }

  override async clear() {
    try {
      if (!this.open())
        throw Error(`Unable to open database`)
      await new Promise((resolve, reject)=> {
        const storeNames = this._db!.objectStoreNames
        const transaction = this._db!.transaction(storeNames, 'readwrite')
        transaction.oncomplete = resolve
        transaction.onabort = () => reject(transaction.error!)
        try {
          for (const storeName of storeNames) {
            const store = transaction.objectStore(storeName)
            store.clear()
          }
        } catch (e) {
          reject(e)
          transaction.abort()
        }
      })
    } finally {
      this.close()
    }
  }
}

//#endregion ###################################################################
//#region                         Stored values
//##############################################################################

export abstract class Stored {

  #rm: ResourceManager
  #id: string
  
  constructor(rm: ResourceManager, id: string, saveOnBlur: boolean = false) {
    this.#rm = rm
    this.#id = id
    if (saveOnBlur) {
      document.addEventListener("visibilitychange", ()=> {
        if (document.visibilityState == "hidden") {
          this.saveToStorage()
        }
      })
    }
  }

  protected async saveToStorage() {
    const data = this.serializeToStorage()
    if (data == null)
      this.deleteStorage()
    else
      return this.#rm.setText(this.#id, data)
  }

  protected async restoreFromStorage() {
    if (await this.#rm.has(this.#id)) {
      const storedStr = await this.#rm.getText(this.#id)
      this.deserializeFromStorage(storedStr)
    }
  }
  
  async deleteStorage() {
    return this.#rm.delete(this.#id)
  }
  
  async storageExists(): Promise<boolean> {
    return this.#rm.has(this.#id)
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

  protected restore(diff: JSONObject | PartialJSON) {
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

  protected async deserializeFromStorage(str: string): Promise<void> {
    return this.restore(JSON.parse(str))
  }
}

export class ValueStorage<T> extends Stored {
  private _val: T|undefined
  private _stringify: (v: T) => string|null
  private _parse: (v: string) => T

  constructor(rm: ResourceManager, name: string,
              stringify: (v: T)=> string|null, parse: (v: string)=> T,
              onBlur?: ()=>(T|undefined|void)) {
    super(rm, name, onBlur != undefined)
    this._stringify = stringify
    this._parse = parse
    this._val = undefined
  }

  async set(value: T) {
    this._val = value
    return this.saveToStorage()
  }

  async get(): Promise<T | undefined> {
    if (this._val === undefined)
      await this.restoreFromStorage()
    return this._val
  }

  protected override serializeToStorage(): string | null {
    return this._stringify(this._val!)
  }
  protected override deserializeFromStorage(str: string): void {
    this._val = this._parse(str)
  }
}
//#endregion ###################################################################
//#region                       Global variables
//##############################################################################

export const sessionRM = new LocalStorageResourceManager(true)
export const localRM = new LocalStorageResourceManager(false)

//#endregion ###################################################################