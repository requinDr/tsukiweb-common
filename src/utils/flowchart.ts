
export type FlowchartNodeAttrs<NodeId extends string> = {
	from?: NodeId[]
}

export abstract class FlowchartNode<NodeId extends string, F extends Flowchart<any>> {
  id: NodeId
  private _parents: (this|NodeId)[] = []
  private _flowchart: F

  constructor(id: NodeId, {from}: FlowchartNodeAttrs<NodeId>,
              flowchart: F) {
    this.id = id
    this._flowchart = flowchart
    if (from)
      this._parents.push(...from)
  }

  get flowchart() {
    return this._flowchart
  }

  get parents(): this[] {
    if (this._parents.length > 0 && !(this._parents[0] instanceof FlowchartNode))
      throw Error(`Cannot read parents before node finalization`)
    return this._parents as this[]
  }
  
  finalize() {
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

type StrKey<T extends Record<string, any>> = Extract<keyof T, string>

export abstract class Flowchart<N extends FlowchartNode<any, any>> {
  private _nodes: Map<N['id'], N>

  constructor(nodes: Record<N['id'], Record<any, any>>) {
    const entries = Object.entries(nodes)
    this._nodes = new Map(entries.map(([id, attrs])=>
      [id, this.createNode(id as N['id'], attrs as Record<any, any>)]
    ))
    for (const node of this._nodes.values()) {
      node.finalize()
    }
  }

  protected abstract createNode(id: N['id'], attrs: Record<any, any>): N

  getNode(id: N['id']) {
    return this._nodes.get(id)
  }
  
  listNodes() {
    return this._nodes.values()
  }
  
  listNodeIds() {
    return this._nodes.keys()
  }
}
