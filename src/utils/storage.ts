import { path } from "motion/react-client";
import { JSONObject, NoMethods, PartialJSON, StrKey } from "../types";
import Timer from "./timer";
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

export abstract class ResourceManager<K extends string = string> {

  #objectUrls: Map<K, [Timer|null, string]> // id -> [timeout, url]

  constructor() {
    this.#objectUrls = new Map()
  }

  abstract updateIndex(): Promise<void>
  abstract has(id: K): boolean
  /**
   * Load the specified resource as a {@link Response}
   * @param id identifier of the resource to load
   */
  abstract getResponse(id: K): Promise<Response>
  abstract setResponse(id: K, response: Response): Promise<void>
  abstract delete(id: K): Promise<void>
  abstract clear(): Promise<void>

  async getStream(id: K): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    return (await this.getResponse(id)).body!
  }
  async getBlob(id: K): Promise<Blob> {
    return (await this.getResponse(id)).blob()
  }
  async getBytes(id: K): Promise<Uint8Array<ArrayBuffer>> {
    return (await this.getResponse(id)).bytes()
  }
  async getText(id: K): Promise<string> {
    return (await this.getResponse(id)).text()
  }
  async getJSON(id: K, reviver?: Parameters<typeof JSON.parse>[1]): Promise<JSONObject> {
    return JSON.parse(await this.getText(id), reviver)
  }
  async getUri(id: K, urlObjectLifeTime: number = 10*60*1000): Promise<string> {
    const stored = this.#objectUrls.get(id)
    if (stored) {
      const [timer, url] = stored
      if (timer && (timer.remainingTime < urlObjectLifeTime)) {
        if (Number.isFinite(urlObjectLifeTime))
          timer.delay = urlObjectLifeTime // restart the timer with the new timeout
        else
          timer.cancel()
      }
      return url
    } else {
      const url = URL.createObjectURL(await this.getBlob(id))
      const timer = Number.isFinite(urlObjectLifeTime) ?
        new Timer(urlObjectLifeTime, this.revokeUri.bind(this, id))
        : null
      this.#objectUrls.set(id, [timer, url])
      return url
    }
  }

  async setStream(id: K, stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
    return this.setResponse(id, new Response(stream))
  }
  async setBlob(id: K, blob: Blob) {
    return this.setResponse(id, new Response(blob))
  }
  async setBytes(id: K, bytes: Uint8Array<ArrayBuffer>) {
    return this.setResponse(id, new Response(bytes))
  }
  async setText(id: K, text: string) {
    return this.setResponse(id, new Response(text))
  }
  async setJSON(id: K, obj: JSONObject,
                replacer?: Parameters<typeof JSON.stringify>[1],
                space?: Parameters<typeof JSON.stringify>[2]) {
    return this.setText(id, JSON.stringify(obj, replacer, space))
  }

  revokeUri(id: K) {
    const stored = this.#objectUrls.get(id)
    if (stored) {
      const [timer, url] = stored
      URL.revokeObjectURL(url)
      timer?.cancel()
      this.#objectUrls.delete(id)
    }
  }
  revokeAllUri() {
    for (const [timer, url] of this.#objectUrls.values()) {
      URL.revokeObjectURL(url)
      timer?.cancel()
    }
    this.#objectUrls.clear()
  }
}

export class RemoteResourceManager<K extends string = string> extends ResourceManager<K> {
  private _getURL: (id: K)=>string|null
  constructor(getURL: (id: K)=>string|null) {
    super()
    this._getURL = getURL
  }
  override async updateIndex() {
    //nothing to do
  }
  override has(id: K) {
    return this._getURL(id) != null
  }
  override async getResponse(id: K) {
    const url = this._getURL(id)!
    return fetch(url)
  }
  override async getUri(id: K, _?: number) {
    return this._getURL(id)!
  }
  override async setResponse(id: K, _: any) {
    throw Error(`Cannot write to remote url`)
  }
  override async delete(id: K) {
  }
  override async clear() {
    //nothing to do
  }
}

export abstract class FSResourceManager<K extends string = string> extends ResourceManager<K> {

  protected abstract createRoot(): Promise<FileSystemDirectoryHandle|null>

  private _root: FileSystemDirectoryHandle|null
  private _files : Map<string, FileSystemFileHandle>
  private _directories : Map<string, FileSystemDirectoryHandle>
  private _getPath: (id: K)=>string|null
  private _ignorePath: (path: string)=>boolean

  constructor(getPath: (id: K)=>string|null, ignore: (path: string)=>boolean) {
    super()
    this._root = null
    this._files = new Map()
    this._directories = new Map()
    this._getPath = getPath
    this._ignorePath = ignore
  }

  private async _createFile(path: string) {
    const pathTokens = path.split('/')
    let dir = this._root!
    const fileName = pathTokens.pop()!
    const opts = {create: true}
    path = ""
    for (const token of pathTokens) {
      path = path.length == 0 ? token : `${path}/${token}`
      if (token.length == 0 || token == '.')
        continue
      const handle = this._directories.get(path)
      if (handle)
        dir = handle
      else {
        dir = await dir.getDirectoryHandle(token, opts)
        this._directories.set(path, dir)
      }
    }
    const file = await dir.getFileHandle(fileName, opts)
    this._files.set(path.length == 0 ? fileName : `${path}/${fileName}`, file)
    return file
  }
  /**
   * Delete the file at the specified path if it exists, then clean up the
   * directories made empty after removing the file, up to a specified amount
   * above the deleted file.
   * @param path 
   * @param cleanUpDepth maximum depth going up when removing empty directories
   */
  private async _deleteFile(path: string, cleanUpDepth: number = 0) {
    const file = this._files.get(path)
    if (!file)
      return
    const array = await this._root!.resolve(file)
    if (!array)
      throw Error(`Parent directory of "${path}" is not accessible`)
    array.pop() // remove file from path array
    let dirPath = ""
    let minCleanLevel = array.length - cleanUpDepth
    let dir = this._root!
    let cleanUpDirectories = (minCleanLevel <= 0 ? [dir] : []) as [FileSystemDirectoryHandle, ...string[]]
    for (const [i, name] of array.entries()) {
      dirPath = dirPath.length == 0 ? name : `${dirPath}/${name}`
      dir = await dir.getDirectoryHandle(name)
      if (i == minCleanLevel) {
        cleanUpDirectories = [dir]
      } else if (i > minCleanLevel) {
        // check if directory has multiple children
        const keys = dir.keys()
        await keys.next() // skip 1st child
        if ((await keys.next()).value)
          cleanUpDirectories = [dir] // at least two children. Directories above it will not be deleted
        else
          cleanUpDirectories.push(dirPath)
      }
    }
    if (cleanUpDirectories.length < 2) {
      dir.removeEntry(file.name)
    } else {
      const parent = cleanUpDirectories[0]
      const child = this._directories.get(cleanUpDirectories[1])!
      parent?.removeEntry(child.name, {recursive: true})
      for (const dirPath of cleanUpDirectories.slice(1)) {
        this._directories.delete(dirPath as string)
      }
    }
    this._files.delete(path)
  }

  override async updateIndex() {
    this._root = await this.createRoot()
    if (!this._root)
      return
    const paths = [['', this._root]] as [string, FileSystemDirectoryHandle][]
    while (paths.length > 0) {
      const [path, dirHandle] = paths.pop()!
      for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = (paths.length == 0) ? name : `${path}/${name}`
        if (!this._ignorePath(fullPath)) {
          if (handle.kind == 'directory')
            paths.push([fullPath, handle])
          else
            this._files.set(fullPath, handle)
        }
      }
    }
  }

  async open(): Promise<boolean> {
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
  
  override has(id: K) {
    const path = this._getPath(id)
    return path != null && this._files.has(path)
  }

  private _getFileHandle(id: K): FileSystemFileHandle {
    return this._files.get(this._getPath(id)!)!
  }
  private async _createWritable(id: K) {
    return this._getFileHandle(id).createWritable()
  }

  override async getResponse(id: K) {
    return new Response(await this.getBlob(id))
  }
  override async getBlob(id: K) {
    return this._getFileHandle(id).getFile()
  }
  override async setResponse(id: K, response: Response) {
    this.setStream(id, response.body!)
  }
  override async setBlob(id: K, blob: Blob) {
    const writable = await this._createWritable(id)
    writable.write(blob)
  }
  override async setStream(id: K, stream: ReadableStream) {
    const writable = await this._createWritable(id)
    const writer = writable.getWriter()
    await writer.ready
    writer.write(stream)
    //writer.releaseLock()
    writer.close()
  }
  override async delete(id: K) {
    const path = this._getPath(id)
    if (!path) return
    this._deleteFile(path)
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

export class UserFSResourceManager<K extends string = string> extends FSResourceManager<K> {
  private _userDirId: string|undefined
  private _mode: string
  constructor(getPath: (id: string)=>string|null,
              ignore: (path: string)=>boolean,
              mode: 'readonly'|'readwrite',
              userDirectoryId?: string) {
    super(getPath, ignore)
    this._userDirId = userDirectoryId
    this._mode = mode
  }

  static isAvailable(global: typeof window): global is DirPickerWindow {
    return ('showDirectoryPicker' in global)
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

export class OPFSResourceManager<K extends string = string> extends FSResourceManager<K> {
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

export class LocalStorageResourceManager<K extends string = string> extends ResourceManager<K> {
  private _storage: Storage
  constructor(session: boolean) {
    super()
    this._storage = session ? sessionStorage : localStorage
  }
  async updateIndex() {
    //nothing to do
  }
  override has(id: K) {
    const n = this._storage.length
    for (let i =0; i < n; i++) {
      if (this._storage.key(i) == id)
        return true
    }
    return false
  }
  override async getText(id: K) {
    return this._storage.getItem(id)!
  }
  override async getResponse(id: K) {
    return new Response(this._storage.getItem(id)!)
  }
  override async setText(id: K, text: string) {
    this._storage.setItem(id, text)
  }
  override async setResponse(id: K, response: Response) {
    this.setText(id, await response.text())
  }
  override async delete(id: K) {
    this._storage.removeItem(id)
  }
  override async clear() {
    this._storage.clear()
  }
}

export class IDBResourceManager<K extends string = string> extends ResourceManager<K> {
  private _dbName: string
  private _db: IDBDatabase|null
  private _onUpgrade: (db: IDBDatabase)=>void
  private _getLocation: (id: string)=>[store: string, key: string]|null
  private _index: Map<string, Array<string>> // store -> keys

  constructor(dbName: string, onUpgrade: (db: IDBDatabase)=>void,
              getLocation: (id: string)=>[store: string, key: string]|null) {
    super()
    this._dbName = dbName
    this._db = null
    this._index = new Map()
    this._onUpgrade = onUpgrade
    this._getLocation = getLocation
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

  async updateIndex(...stores: string[]) {
    try {
      if (!await this.open())
        throw Error(`Unable to open database`)
      if (stores.length == 0)
        stores = this._db!.objectStoreNames as unknown as string[]
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

  override has(id: K) {
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

  override async getBlob(id: K) {

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
  override async getResponse(id: K) {
    return new Response(await this.getBlob(id))
  }
  override async setBlob(id: K, data: Blob) {
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

  override async setResponse(id: K, response: Response) {
    return this.setBlob(id, await response.blob())
  }

  override async delete(id: K) {
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

export class BlobMapResourceManager<K extends string = string> extends ResourceManager<K> {
  private _map = new Map<K, Blob>()
  async updateIndex() {
    // nothing to do
  }
  override has(id: K) {
    return this._map.has(id)
  }
  override async getResponse(id: K) {
    return new Response(this._map.get(id))
  }
  override async setResponse(id: K, response: Response) {
    this._map.set(id, await response.blob())
  }
  override async getBlob(id: K) {
    return this._map.get(id)!
  }
  override async setBlob(id: K, blob: Blob) {
    this._map.set(id, blob)
  }
  override async delete(id: K) {
    this._map.delete(id)
  }
  override async clear() {
    this._map.clear()
  }
}

export class LayeredResourceManager<K extends string = string> extends ResourceManager<K> {

  private _rms: ResourceManager<K>[]
  private _index: Map<K, ResourceManager<K>>
  constructor(...rms: ResourceManager<K>[]) {
    super()
    this._rms = rms
    this._index = new Map()
  }

  async updateIndex() {
    await Promise.all(this._rms.map(rm=>rm.updateIndex()))
  }
  private _getRM(id: K) {
    const rm = this._index.get(id)
    if (rm)
      return rm
    for (const rm of this._rms) {
      if (rm.has(id)) {
        this._index.set(id, rm)
        return rm
      }
    }
    return null
  }
  override has(id: K) {
    return this._getRM(id) != null
  }
  override async getResponse(id: K) {
    return this._getRM(id)!.getResponse(id)
  }
  override async getBlob(id: K) {
    return this._getRM(id)!.getBlob(id)
  }
  override async getBytes(id: K) {
    return this._getRM(id)!.getBytes(id)
  }
  override async getStream(id: K) {
    return this._getRM(id)!.getStream(id)
  }
  override async getText(id: K) {
    return this._getRM(id)!.getText(id)
  }
  override async getJSON(id: K) {
    return this._getRM(id)!.getJSON(id)
  }
  override async getUri(id: K) {
    return this._getRM(id)!.getUri(id)
  }
  override async setResponse(id: K, response: Response) {
    return this._getRM(id)!.setResponse(id, response)
  }
  override async setBlob(id: K, blob: Blob) {
    return this._getRM(id)!.setBlob(id, blob)
  }
  override async setBytes(id: K, bytes: Uint8Array<ArrayBuffer>) {
    return this._getRM(id)!.setBytes(id, bytes)
  }
  override async setStream(id: K, stream: ReadableStream<Uint8Array<ArrayBuffer>>) {
    return this._getRM(id)!.setStream(id, stream)
  }
  override async setText(id: K, text: string) {
    return this._getRM(id)!.setText(id, text)
  }
  override async setJSON(id: K, obj: JSONObject, replacer?: Parameters<typeof JSON.stringify>[1], space?: Parameters<typeof JSON.stringify>[2]) {
    return this._getRM(id)!.setJSON(id, obj, replacer, space)
  }
  override async delete(id: K) {
    for (const rm of this._rms) {
      if (rm.has(id))
        rm.delete(id)
    }
    this._index.delete(id)
  }
  override async clear() {
    for (const rm of this._rms) {
      rm.clear()
    }
    this._index.clear()
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