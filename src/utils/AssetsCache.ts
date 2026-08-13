import { Key } from "react";
import { PartialRecord } from "../types";

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
type StoredAsset<K extends string, V> = {
    id: K,
    urlExpiry: number
} & Asset<V>

/**
 * Asset as returned by the `get` method, with a fixed value instead of a potential promise
 */
type PromisedAsset<K extends string, V> = Exclude<StoredAsset<K, V>, 'value'> & {
    value: V
}

type AssetKey<P extends Record<string, string>> = Extract<keyof P, string>

export class AssetsCache<Providers extends Record<string, Record<string, any>>> {

    private _map: Map<AssetKey<Providers[any]>, WeakRef<StoredAsset<AssetKey<Providers[any]>, Providers[any][any]>>>
    private _providers: Map<keyof Providers, (k: AssetKey<Providers[any]>)=>Asset<Providers[any][any]>|undefined>
    private _urlCacheDuration: number

    constructor(urlCacheDuration: number = 2*3600*1000) { // default cache duration : 2 hours
            
        this._map = new Map()
        this._providers = new Map()
        this._urlCacheDuration = urlCacheDuration
    }
    private _getAsset<P extends keyof Providers>(
            providerKey: P|undefined,
            key: AssetKey<Providers[P]>,
            forceReload: boolean = false) {
        
        if (!forceReload) {
            const stored = this._map.get(key)?.deref()
            if (stored)
                return stored
        } else {
            this._map.delete(key)
        }
        let asset
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
                throw Error(`No provider recognized asset id ${key}`)
        }
        asset = {
            id: key,
            urlExpiry: Date.now() + this._urlCacheDuration,
            ...asset
        } as StoredAsset<typeof key, any>
        this._map.set(key, new WeakRef(asset))
        if (asset.value instanceof Promise) {
            asset.value.then(val=> {
                asset.value = val
            })
        }
        return asset
    }
    setProvider<P extends keyof Providers>(
            key: P,
            provider: (k: AssetKey<Providers[P]>)=>Asset<Providers[P][any]>|undefined) {
        this._providers.set(key, provider)
    }

    has(key: AssetKey<Providers[any]>): boolean {
        if (this._map.get(key)?.deref())
            return true
        return false
    }
    async get<P extends keyof Providers, K extends AssetKey<Providers[P]>>(
            providerKey: P|undefined,
            key: K,
            forceReload: boolean = false): Promise<PromisedAsset<K, Providers[P][K]>> {
        const asset = this._getAsset(providerKey, key, forceReload)
        if (asset.value instanceof Promise){
            // wait for the promise to be fulfilled, wich also replaces
            // the value with the fetched value
            await asset.value
        }
        return asset as PromisedAsset<K, Providers[P][K]>
    }
    getUrl<P extends keyof Providers>(
            providerKey: P|undefined,
            key: AssetKey<Providers[P]>) {
        const asset = this._getAsset(providerKey, key)
        return asset.url
    }
    clear() {
        this._map.clear()
    }

}