import { Provider } from "react";

type Ref<T> = { deref(): T|undefined }

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

export class AssetsCache<Providers extends Record<string, any>> {

    private _map: Map<string, StoredAsset<Providers[any]>>
    private _providers: Map<string, (k: string)=>Asset<Providers[any]>|undefined>
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
        let asset: Asset<Providers[P]>|undefined
        if (providerKey) {
            const provider = this._providers.get(providerKey)
            if (!provider)
                throw Error(`Unregistered provider ${providerKey as string}`)
            asset = provider(key)
        } else {
            for (const provider of this._providers.values()) {
                asset = provider(key)
                if (asset)
                    break
            }
            if (!asset)
                throw Error(`No provider recognized asset id ${key.toString()}`)
        }
        let stored: StoredAsset<Providers[P]>
        const value = asset!.value
        if (value instanceof Promise) {
            stored = { id: key, ...asset! }
            value.then(val=> {
                stored.value = (typeof val == "object") ?
                    new WeakRef(val)
                    : new PrimitiveRef(val, this._urlCacheDuration)
            })
        } else {
            let ref = (typeof value == "object") ?
                new WeakRef(value)
                : new PrimitiveRef(value, this._urlCacheDuration)
            stored = { id: key, url: asset!.url, value: ref }
        }
        this._map.set(key, stored)
        return stored
    }
    setProvider<P extends StrKey<Providers>>(
            key: P,
            provider: (k: string)=>Asset<Providers[P]>|undefined) {
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
            forceReload: boolean = false): Promise<Providers[P]> {
        // Request the asset from the storage, fetch it if new or expired
        const asset = this._getAsset(providerKey, key, forceReload)
        if (asset.value instanceof Promise){
            // wait for the promise to be fulfilled, wich also replaces
            // the value with a reference to the fetched value
            await asset.value
        }
        return (asset.value as Ref<Providers[P]>).deref()!
    }
    getUrl<P extends StrKey<Providers>>(
            providerKey: P|undefined,
            key: string) {
        const asset = this._getAsset(providerKey, key)
        return asset.url
    }
    clear() {
        this._map.clear()
    }

}