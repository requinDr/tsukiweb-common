type AsyncEventCallback = (...args: any)=>void|Promise<void>
type EventType = NonNullable<any>
/**
 * Events Listeners handler for a single event
 */
export class AsyncEventDispatcher<T extends AsyncEventCallback> {
    private _listeners: Array<T> = []

    addEventListener<F extends T>(listener: F) {
        this._listeners.push(listener)
        return listener
    }

    removeEventListener(listener: T) {
        const index = this._listeners.indexOf(listener)
        if (index < 0)
            return false
        this._listeners.splice(index, 1)
        return true
    }

    clearEventListeners() {
        this._listeners.splice(0)
    }

    async dispatchEvent(...args: Parameters<T>) {
        for (const l of this._listeners)
            await l(...args)
    }
}

/**
 * Events Listeners handler for multiple events
 */
export class AsyncEventsDispatcher<T extends Record<EventType, AsyncEventCallback>> {
    private _listeners: Map<keyof T, T[keyof T][]> = new Map()

    addEventListener<E extends keyof T, F extends T[E]>(event: E, listener: F) {
        let array = this._listeners.get(event)
        if (!array) {
            array = []
            this._listeners.set(event, array)
        }
        array.push(listener)
        return listener
    }

    removeEventListener<E extends keyof T>(event: E, listener: T[E]) {
        const array = this._listeners.get(event)
        if (!array)
            return false
        const index = array.indexOf(listener)
        if (index < 0)
            return false
        array.splice(index, 1)
        return true
    }

    clearEventListeners(): void
    clearEventListeners(event: keyof T): void
    clearEventListeners(event?: keyof T) {
        if (event != undefined)
            this._listeners.get(event)?.splice(0)
        else
            this._listeners.clear()
    }

    async dispatchEvent<E extends keyof T>(event: E, ...args: Parameters<T[E]>) {
        const array = this._listeners.get(event)
        if (array) {
            for (const listener of array) {
                await listener(...args)
            }
        }
    }
}