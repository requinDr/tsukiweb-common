export type FlowchartNodeAttrs<NodeId extends string> = {
	from?: NodeId[]
}

export abstract class FlowchartNode<NodeId extends string, F extends Flowchart<any>> {
  id: NodeId
  private _from: NodeId[]
  private _parents: this[] | undefined
  private _group: string|null|undefined
  private _flowchart: F

  constructor(id: NodeId, {from = []}: FlowchartNodeAttrs<NodeId>,
              flowchart: F) {
    this.id = id
    this._flowchart = flowchart
    this._from = from
  }

  get flowchart() {
    return this._flowchart
  }

  get group(): string|undefined {
    if (this._group === undefined)
      this._group = this.parents.find(p => p.group !== undefined)?.group ?? null
    return this._group ?? undefined
  }

  get parents(): this[] {
    if (!this._parents)
      throw Error(`Cannot read parents before node finalization`)
    return this._parents
  }

  finalize(group?: string) {
    this._group = group
    this._parents = this._from.map(id => {
      const node = this.flowchart.getNode(id)
      if (!node)
        throw Error(`could not get parent node ${id}`)
      return node as this
    })
  }
}

export abstract class Flowchart<N extends FlowchartNode<any, any>> {
  private _nodes: Map<N['id'], N>

  constructor(nodes: Record<N['id'], Record<any, any>>, groups: Record<string, N['id'][]> = {}) {
    const groupOf = new Map(Object.entries(groups).flatMap(([group, ids]) =>
      ids.map(id => [id, group] as const)))
    this._nodes = new Map(Object.entries(nodes).map(([id, attrs])=>
      [id, this.createNode(id as N['id'], attrs as Record<any, any>)]
    ))
    for (const node of this._nodes.values())
      node.finalize(groupOf.get(node.id))
  }

  protected abstract createNode(id: N['id'], attrs: Record<any, any>): N

  getNode(id: N['id']) {
    return this._nodes.get(id)
  }

  listNodes() {
    return Array.from(this._nodes.values())
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