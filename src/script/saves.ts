import { Stored } from "../utils/storage"
import { textFileUserDownload } from "../utils/utils"

export type SaveState = {
    date: number
    version: string
    name?: string
    id?: number
}

export abstract class SavesManager<SS extends SaveState> extends Stored {
    
    private _saveStates: Map<SS['id'], SS>
    private _changeListeners: Set<VoidFunction>
    
    constructor(storageName: string) {
        super(storageName, false)
        this._saveStates = new Map()
        this._changeListeners = new Set
        this.restoreFromStorage()
    }
    protected abstract app_version: string
    protected abstract save_ext: string
    
    //##############################################################################
    //#region                        PRIVATE METHODS
    //##############################################################################
    
    private _notifyListeners() {
        for (const listener of this._changeListeners)
            listener()
    }
    
    protected import(saves: {version:string, saveStates:SS[]}) {
        const saveStates = saves.saveStates
        this.add(...saveStates)
    }
    
    protected override serializeToStorage(): string {
        return JSON.stringify({
            version: this.app_version,
            saveStates: Array.from(this._saveStates.values())
        })
    }
    
    protected override deserializeFromStorage(str: string): void {
        const json = JSON.parse(str)
        this.import(json)
    }

    protected fileName(save: SS): `${string}.${string}` {
        let date = new Date(save.date as number)
        date.setTime(date.getTime() + date.getTimezoneOffset()*60e3)
        date.setMilliseconds(0)
        let baseName = date.toISOString()
            .replace(':', '-')
            .replace('T', '_')
            .replace('.000Z', '')
        if (save.name)
            baseName += `_${save.name}`
        return `${baseName}.${this.save_ext}`
    }
    
    //#endregion ###################################################################
    //#region                           LISTENERS
    //##############################################################################
    
    addListener(listener: VoidFunction) {
        this._changeListeners.add(listener)
    }

    removeListener(listener: VoidFunction) {
        this._changeListeners.delete(listener)
    }
    
    //#endregion ###################################################################
    //#region                            GETTERS
    //##############################################################################
    
    get savesCount() {
        return this._saveStates.size
    }
    
    listSaves() {
        return Array.from(this._saveStates.values())
    }
    
    get(id: SS['id']) {
        return this._saveStates.get(id)
    }
    
    getLastSave(): SS | undefined {
        return this.listSaves().reduce((a, b)=> a.date > b.date ? a : b)
    }
    
    /**
    * Export the save-states to json files and lets the user download them.
    * @param ids array of save-state ids to export. Exporting multiple save-states
    *            will result in multiple files being downloaded
    */
    exportSave(id: SS['id']) {
        const ss = this.get(id)
        if (!ss)
            return
        const json = JSON.stringify({ id, ...ss })
        const fileName = this.fileName(ss)
        const ext = fileName.substring(fileName.indexOf('.')+1)
        textFileUserDownload(json, fileName, `application/${ext}+json`)
    }
    
    //#endregion ###################################################################
    //#region                          EDIT SAVES
    //##############################################################################
    
    clear() {
        this._saveStates.clear()
        this.deleteStorage()
        this._notifyListeners()
    }
    
    add(...saves: SS[]): void | Promise<void> {
        let id
        for (const save of saves) {
            id = save.id ?? save.date
            this._saveStates.set(id, save)
        }
        this.saveToStorage()
        this._notifyListeners()
    }
    
    remove(id: SS['id']) {
        this._saveStates.delete(id)
        this.saveToStorage()
        this._notifyListeners()
    }
    
    async importSaveFile(save: string|File): Promise<void> {
        if (save instanceof File)
            save = await new Promise<string>((resolve)=> {
                const reader = new FileReader()
                reader.readAsText(save as File)
                reader.onload = (evt)=> {
                    if (evt.target?.result?.constructor == String)
                        resolve(evt.target.result)
                    else
                        throw Error(`Cannot read save file ${(save as File).name}`)
            }
        })
        await this.add(JSON.parse(save) as SS)
    }
    
    async importSaveFiles(saves: string[] | FileList | File[]): Promise<void> {
        await Promise.all(
            Array.from<string|File, Promise<void>>(saves, this.importSaveFile.bind(this)))
        }
    }