type Ref<T> = { deref(): T|undefined } // Match WeakRef and PrimitiveRef below

class PrimitiveRef<T extends Exclude<any, object>> {
    private _value: T;
    private _expirationTime: number

    constructor(value: T, expirationDelay: number) {
        this._value = value
        this._expirationTime = Date.now() + expirationDelay
    }

    deref() {
        return (Date.now() < this._expirationTime) ?
            this._value
            : undefined
    }
}

/**
 * Asset object as returned by the `idToAsset` function.
 */
type Asset<V> = {
    url: string,
    value: V|Promise<V>
}

/**
 * Asset object as stored in the AssetsCache class, with the id and an
 * expiration time for the url
 */
type StoredAsset<V> = {
    id: string,
    url: string,
    value: Ref<V>|Promise<V>
}
type StrKey<T extends Record<string, any>> = keyof T & string

/**
 * Function that takes an asset id and returns either :
 * - `undefined` if the provider is not applicable for the asset;
 * - `null` if there is no asset linked to this id (i.e. the id is used as-is);
 * - an object containing the url where the asset is fetched, and its value or
 *   a promise that eventually resolves with its value.
 */
type Provider<T> = (k: string)=>Asset<T>|null|undefined

export class AssetsCache<Providers extends Record<string, any>> {

    private _map: Map<string, StoredAsset<Providers[any]>|null>
    private _providers: Map<string, Provider<Providers[any]>>
    private _urlCacheDuration: number

    constructor(urlCacheDuration: number = 30*60*1000) { // default cache duration for urls: 30 minutes
            
        this._map = new Map()
        this._providers = new Map()
        this._urlCacheDuration = urlCacheDuration
    }
    private _getAsset<P extends StrKey<Providers>>(
            providerKey: P|undefined,
            key: string,
            forceReload: boolean = false) {
        
        if (!forceReload) {
            const asset = this._map.get(key)
            if (asset) {
                const value = asset.value
                if (value instanceof Promise)
                    return asset
                const deref = value.deref()
                if (deref)
                    return asset
            }
        } else {
            this._map.delete(key)
        }
        let asset: Asset<Providers[P]>|null|undefined
        if (providerKey) {
            const provider = this._providers.get(providerKey)
            if (!provider)
                throw Error(`Unregistered provider ${providerKey as string}`)
            asset = provider(key)
            if (asset === undefined)
                throw Error(`provider ${providerKey} did not recognize asset id ${key.toString()}`)
        } else {
            for (const provider of this._providers.values()) {
                asset = provider(key)
                if (asset !== undefined)
                    break
            }
            if (asset === undefined)
                throw Error(`No provider recognized asset id ${key.toString()}`)
        }
        if (asset === null) {
            this._map.set(key, null)
            return null
        }
        let stored: StoredAsset<Providers[P]>|null
        if (asset === null) {
            stored = null
        } else if (asset.value instanceof Promise) {
            stored = { id: key, ...asset }
            asset.value.then(val=> {
                stored!.value = (typeof val == "object") ?
                    new WeakRef(val)
                    : new PrimitiveRef(val, this._urlCacheDuration)
            })
        } else {
            let ref = (typeof asset.value == "object") ?
                new WeakRef(asset.value)
                : new PrimitiveRef(asset.value, this._urlCacheDuration)
            stored = { id: key, url: asset!.url, value: ref }
        }
        this._map.set(key, stored)
        return stored
    }
    setProvider<P extends StrKey<Providers>>(
            key: P,
            provider: Provider<Providers[P]>) {
        this._providers.set(key, provider)
    }

    has(key: string): boolean {
        const asset = this._map.get(key)
        if (!asset)
            return false
        const value = asset.value
        if (value instanceof Promise)
            return true
        const deref = value.deref()
        if (deref)
            return true
        return false
    }

    load(providerKey: StrKey<Providers>|undefined, key: string,
         forceReload: boolean = false) {
        this._getAsset(providerKey, key, forceReload)
    }

    async get<P extends StrKey<Providers>>(
            providerKey: P|undefined,
            key: string,
            forceReload: boolean = false): Promise<Providers[P]|null> {
        // Request the asset from the storage, fetch it if new or expired
        const asset = this._getAsset(providerKey, key, forceReload)
        if (asset === null)
            return asset
        if (asset.value instanceof Promise){
            // wait for the promise to be fulfilled, wich also replaces
            // the value with a reference to the fetched value
            await asset.value
        }
        return (asset.value as Ref<Providers[P]>).deref()!
    }
    getUrl<P extends StrKey<Providers>>(
            providerKey: P|undefined,
            key: string): string {
        const asset = this._getAsset(providerKey, key)
        if (!asset)
            throw Error(`asset id ${key} has no url`)
        return asset.url
    }
    clear() {
        this._map.clear()
    }

}