

export class AssetsMap<Key, Value extends WeakKey> {

    private _map: Map<Key, WeakRef<Value>|Promise<Value>>
    private _loader: (key: Key)=> Promise<Value>

    constructor(loader: typeof this._loader) {
        this._map = new Map()
        this._loader = loader
    }

    has(key: Key): boolean {
        const stored = this._map.get(key)
        if (stored instanceof WeakRef) {
            const value = stored.deref()
            if (value)
                return true
        }
        return false
    }

    async get(key: Key, forceReload: boolean = false): Promise<Value> {
        if (!forceReload) {
            const stored = this._map.get(key)
            if (stored) {
                if (stored instanceof Promise)
                    return stored
                let value = stored.deref()
                if (value)
                    return value
            }
        }
        const promise = this._loader(key).then(value => {
                if (this._map.has(key)) // do not re-insert if key was removed before load
                    this._map.set(key, new WeakRef(value))
                return value
            })
        this._map.set(key, promise)
        return promise
    }
    clear() {
        this._map.clear()
    }

}