import { Stored } from "../utils/storage"
import { Queue } from "../utils/queue"
import { JSONDiff, JSONObject, PartialJSON, WithRequired } from "../types"
import { jsonDiff, jsonMerge } from "../utils/utils"
import { ScriptPlayerBase } from "./ScriptPlayer"

//##############################################################################
//#region                             TYPES
//##############################################################################

type SPB<DP extends JSONObject = JSONObject, DS extends JSONObject = JSONObject>
  = ScriptPlayerBase<any, JSONObject, JSONObject> & {
    ['pageContext']: ()=> Omit<PageContent, 'type'> & PartialJSON<DP> & unknown,
    ['blockContext']: ()=> SceneContent & PartialJSON<DS> & unknown,
  }
type PageContext<SP extends SPB> = ReturnType<SP['pageContext']>
type BlockContext<SP extends SPB> = ReturnType<SP['blockContext']>
type PageContent = { type: string, label: string, page: number }
type SceneContent = { label: string }
type SceneLabel<SP extends SPB> = Exclude<SP['currentLabel'], null|undefined>

//##############################################################################
//#region                            QUEUES
//##############################################################################

class DiffSaveQueue<D extends JSONObject, T extends PartialJSON<D>> extends Queue<T> {
  private _defaultValue: Readonly<D>
  constructor(defaultValue: D, limit: number = 0,
              onLimitReached: 'shift'|'discard'|'error' = 'shift') {
    super(limit, onLimitReached)
    this._defaultValue = defaultValue ?? { } as PartialJSON<T>
  }

  get default() { return this._defaultValue }

  exportJSON(start: number = 0, stop: number = this.length):
      [] | [JSONDiff<T, D>] | [JSONDiff<T, D>, ...PartialJSON<T>[], JSONDiff<T, D>]  {
    return Array.from(this.all().slice(start, stop), (e, i)=>
      (i == 0 || i == stop-1) ? this.diff(e, this._defaultValue)
                              : this.diff(e, this.get(i-1)!)
    ) as any
  }
  importJSON(entries: Array<PartialJSON<T>>) {
    this.clear()
    const merged = new Array(entries.length)
    entries.forEach((e, i)=> {
      merged[i] = (i == 0 || i == entries.length-1) ?
         this.merge(e, this._defaultValue as any) // first/last is at laast complementary to default
       : this.merge(e, merged[i-1])
    })
    this.push(...merged)
  }

  protected diff(current: T, previous: T|D): PartialJSON<T> {
    return jsonDiff(current, previous) as any
  }
  protected merge(current: Omit<T, keyof D> & PartialJSON<T>, _default: Readonly<D>): T
  protected merge(current: PartialJSON<T>, previous: Readonly<T>): T
  protected merge(c: any, p: any): T {
    return jsonMerge(c, p) as T
  }
}


class PagesQueue<D extends JSONObject, T extends PartialJSON<D> & PageContent>
    extends DiffSaveQueue<D, T> {
                  
  protected diff(current: T, previous: T|D): PartialJSON<T> {
    return super.diff(current, {...previous, type: 'text' } as any) as any
  }
  protected merge(current: Omit<T, keyof D> & PartialJSON<T>, _default: Readonly<D>): T
  protected merge(current: PartialJSON<T>, previous: Readonly<T|D>): T
  protected merge(c: any, p: any): T {
    return super.merge(c, {...p, type: 'text'})
  }
}

class ScenesQueue<D extends JSONObject, T extends PartialJSON<D> & SceneContent>
  extends DiffSaveQueue<D, T> {
  // base diff and merge are fine for scene entries
}

//#endregion ###################################################################
//#region                          CONSTRUCTOR
//##############################################################################

type Params<DP extends JSONObject, DS extends JSONObject> = {
  limit: number
  storageId: string
  restore?: boolean,
  defaultPage: DP,
  defaultBlock: DS
}

export abstract class HistoryBase<
    SP extends SPB<DP, DS>,
    PageType extends string,
    DP extends JSONObject,
    DS extends JSONObject,
    > extends Stored {

  protected pages: PagesQueue<DP, PageContext<SP> & {type: string}>
  protected scenes: ScenesQueue<DS, BlockContext<SP>>
  protected pageContext: PartialJSON<ReturnType<SP['pageContext']>>|null
  

  constructor({limit, storageId, restore = false, defaultPage, defaultBlock}: Params<DP, DS>) {
    super(storageId, true, true)
    this.pages = new PagesQueue(defaultPage, limit) as any
    this.scenes = new ScenesQueue(defaultBlock) as any
    this.pageContext = null
    if (restore)
      this.restoreFromStorage()
  }

//#endregion ###################################################################
//#region                          PROPERTIES
//##############################################################################

  get lastPage()    { return this.pages.head }
  get allPages()    { return this.pages.slice() }
  get pagesLength() { return this.pages.length }
  get lastScene()   { return this.scenes.head }

  get pagesLimit()  { return this.pages.limit }
  set pagesLimit(value: number) {
    this.pages.limit = value
  }
  get empty() {
    return this.scenes.empty
  }

//#endregion ###################################################################
//#region                        PUBLIC METHODS
//##############################################################################

  sceneIndex(label: SceneLabel<SP>) {
    return this.scenes.findLastIndex(s=>s.label == label)
  }
  
  sceneContent(label: SceneLabel<SP>) : BlockContext<SP> | undefined {
    return this.scenes.findLast(s => s.label == label)
  }
  
  hasScene(label: SceneLabel<SP>) {
    return this.sceneIndex(label) >= 0
  }

  clear() {
    this.pages.clear()
    this.scenes.clear()
  }

  onPageStart(context: WithRequired<PartialJSON<PageContext<SP>>, 'page' | 'label'>) {
    this.pageContext = context
    if (this.pages.length > 0) { // remove duplicate last page if necessary
      const lastPage = this.lastPage
      if (lastPage.page == context.page &&
          lastPage.label == context.label)
        this.pages.splice(-1)
    }
  }

  onBlockStart(context: BlockContext<SP>) {
    const {label} = context
    if (this.isScene(label as any) && label != this.lastScene.label) {
      this.scenes.push(context)
    }
  }

//#endregion ###################################################################
//#region                        PRIVATE METHODS
//##############################################################################
  
  protected abstract isScene(label: PageContext<SP>['label']): boolean

  protected setPage(content: {type: PageType} & JSONObject) {
    if (this.pageContext) {
      const c = jsonMerge(content, this.pageContext)
      this.pages.push(c as ({type: PageType} & PageContext<SP>))
      this.pageContext = null
    } else {
      throw Error(`Page context already used`)
    }
  }


  protected getSceneIndexAtPage(pageIndex: number): number {
    const page = this.pages.get(pageIndex)!
    let label: string|undefined = page.label
    if (!this.isScene(label as any)) {
      // not a scene => search previous pages
      label = this.pages.findLast(p=>this.isScene(p.label as any), pageIndex)?.label
      if (!label) {
        // no valid label found in previous pages. Search on next pages
        label = this.pages.find(p=>this.isScene(p.label as any), pageIndex)?.label
        if (!label) // only entry in history. Must be the last scene visited
          return this.scenes.length-1
        // next scene found, return previous one
        return this.scenes.findLastIndex(s => s.label == label) - 1
      }
    }
    return this.scenes.findLastIndex(s=>s.label == label)
  }

  protected export(index: number = this.pagesLength-1,
                   pagesMaxLength: number = this.pages.length) {
    if (index < 0)
      index = this.pages.length + index
    const sceneIndex = this.getSceneIndexAtPage(index)
    const firstPageIndex = Math.max(0, index + 1 - pagesMaxLength)
    const pages = this.pages.exportJSON(firstPageIndex, index+1)
    return {
      scenes: this.scenes.exportJSON(0, sceneIndex+1),
      pages: pages
    }
  }

  protected import(obj: ReturnType<HistoryBase<SP, PageType, DP, DS>['export']>){
    this.clear()
    // TODO filter scenes and pages (jsonDiff with default)
    if (obj.scenes.length == 0) {
      if (obj.pages.length == 0) {
        console.error(obj)
        throw Error("no page and no scene in imported history")
      } else {
        const label = obj.pages.at(-1)!.label as any
        this.scenes.importJSON([{label}])
        this.pages.importJSON(obj.pages)
      }
    } else if (obj.pages.length == 0) {
        this.scenes.importJSON(obj.scenes)
    } else {
        this.scenes.importJSON(obj.scenes)
        this.pages.importJSON(obj.pages)
    }
  }

  protected override serializeToStorage(): string {
    return JSON.stringify({
      pages: this.pages.slice(),
      scenes: this.scenes.slice()
    })
  }

  protected override deserializeFromStorage(str: string): void {
    const {pages, scenes} = JSON.parse(str)
    this.clear()
    for (const page of pages)
      this.pages.push(page)
    for (const scene of scenes)
      this.scenes.push(scene)
  }
}

export default HistoryBase