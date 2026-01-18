import { observeChildren, observe } from "./Observer"
import { StoredJSON } from "./storage"
import { TEXT_SPEED, ViewRatio } from "../constants"

export class Settings extends StoredJSON {

  textSpeed: TEXT_SPEED = TEXT_SPEED.normal
  autoClickDelay: number = 600
  nextPageDelay: number = 2500
  fastForwardDelay: number = 5
  enableSceneSkip: boolean = true
  
  gameFont: string = "Ubuntu" // [not implemented]
  uiFont: string = "Ubuntu" // [not implemented]
  fixedRatio: ViewRatio = ViewRatio.unconstrained
  
  blurThumbnails: boolean = true
  warnHScenes: boolean = false
  
  volume = {
    master: 6,
    track: 8,
    se: 8,
    titleTrack: 8,
    systemSE: 6,
  }
  autoMute: boolean = true

  unlockEverything: boolean = false

  historyLength: number = 20
  savedHistoryLength: number = 10

  lastFullExport = {
    date: Date.now(),
    hash: 0
  }
  localStorageWarningDelay: number = 3 * 24 * 60 * 60 * 1000 // 3 days

  completedScenes: Array<string> = new Array()


  #saveTimeout: NodeJS.Timeout|0 = 0
  #saveDelay: number

  constructor(name: string, saveOnBlur: boolean = true, saveDelay = 0) {
    super(name, false, saveOnBlur)
    this.#saveDelay = saveDelay
    // If no child class, finish initialization now. Children classes
    // should call `init()` after calling the constructor.
    // It ensures that all attributes are created before listing the attributes,
    // restoring the values and creating a reference to make diffs.
    // If the child class can be a parent class, copy this test.
    if (this.constructor == Settings)
      this.init()
  }
  protected init() {
    this.setAsDiffReference()
    this.restoreFromStorage()

    const postPoneSave = this.postPoneSave.bind(this)
    for (const key of this.listAttributes()) {
      if (typeof this[key] == "object")
        observeChildren(this, key, postPoneSave)
      else {
        observe(this, key, postPoneSave)
      }
    }
  }

  /**
   * Return if the specified scene has been viewed by the player.
   */
  viewedScene(scene: string): boolean {
    return this.completedScenes.includes(scene)
  }

  override saveToStorage(): void {
    this.completedScenes.sort()
    super.saveToStorage()
    if (this.#saveTimeout != 0) {
      clearTimeout(this.#saveTimeout)
      this.#saveTimeout = 0
    }
  }

  private postPoneSave() {
    if (this.#saveTimeout == 0) {
      this.#saveTimeout = setTimeout(
        this.saveToStorage.bind(this),
        this.#saveDelay)
    }
  } 
}

export default Settings
