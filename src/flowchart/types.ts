import { Digit, PartialRecord, UcLetter } from "../types"

export type FcNodeAttrs = {
	col: number
	from: string[]
	cutAt?: number
	align?: string
}

export type FlowchartJson<CharId extends string, SceneId extends string> = {
  nodes: Record<string, FcNodeAttrs>,
  scenes: Record<SceneId, FcNodeAttrs>,
  badges: {
    points: Record<CharId, PartialRecord<SceneId, number>>
    flags: PartialRecord<UcLetter|Digit, Array<string>>
    select: Record<SceneId, {copy?: SceneId, conditions: (0|string)[]}>
    conditions: Record<SceneId, string>
  }
}

export type FlowchartNodeAttrs<NodeId extends string> = {
	from?: NodeId[]
}

export abstract class FlowchartNode<NodeId extends string, F extends Flowchart<any>> {
  id: NodeId
  private _parents: (this|NodeId)[] = []
  private _group: string|undefined
  private _flowchart: F

  constructor(id: NodeId, {from}: FlowchartNodeAttrs<NodeId>,
              flowchart: F) {
    this.id = id
    this._flowchart = flowchart
    if (from)
      this._parents.push(...from)
    this._group = undefined
  }

  get flowchart() {
    return this._flowchart
  }

  get group() {
    if (this._group)
      return this._group
    for (const p of this.parents) {
      const g = p.group
      if (g) {
        this._group = g
        break
      }
    }
    return this._group
  }

  get parents(): this[] {
    if (this._parents.length > 0 && !(this._parents[0] instanceof FlowchartNode))
      throw Error(`Cannot read parents before node finalization`)
    return this._parents as this[]
  }
  
  finalize(group?: string) {
    this._group = group
    this._parents.splice(0, this._parents.length, ...this._parents.map(id=> {
      let x: NodeId|this|undefined = id
      if (!(x instanceof FlowchartNode))
        x = this.flowchart.getNode(x) as this
      if (x instanceof FlowchartNode)
        return x
      else
        throw Error(`could not get parent node ${id}`)
    }))
  }
}

export abstract class Flowchart<N extends FlowchartNode<any, any>> {
  private _nodes: Map<N['id'], N>

  constructor(nodes: Record<N['id'], Record<any, any>>, groups?: Record<string, N['id'][]>) {
    const entries = Object.entries(nodes)
    const groupsMap = new Map()
    if (groups) {
      for (const [group, ids] of Object.entries(groups)) {
        for (const id of ids) {
          groupsMap.set(id, group)
        }
      }
    }
    this._nodes = new Map(entries.map(([id, attrs])=>
      [id, this.createNode(id as N['id'], attrs as Record<any, any>)]
    ))
    for (const node of this._nodes.values()) {
      node.finalize(groupsMap.get(node.id))
    }
  }

  protected abstract createNode(id: N['id'], attrs: Record<any, any>): N

  getNode(id: N['id']) {
    return this._nodes.get(id)
  }
  
  listNodes() {
    return Array.from(this._nodes.values())
  }
  
  listNodeIds() {
    return this._nodes.keys()
  }
}

export type SpritesheetMetadataType = {
	f: string[] // file names
	s: number[][] // spritesheet dimensions: [nw, nh] for each spritesheet
	d: number[] // dimensions: [width, height]
	i: {
		[key: string]: number[] // [top, left, file index]
	}
}