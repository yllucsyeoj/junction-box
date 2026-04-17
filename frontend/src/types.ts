// NUON graph format — the saved/loaded artifact
export interface GraphNode {
  id: string
  type: string
  position: { x: number; y: number }
  params: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  from: string
  from_port: string
  to: string
  to_port: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Node spec — derived from primitives.nu introspection
export interface Port {
  name: string
  type: string // 'table' | 'string' | 'number' | 'any' | 'nothing' | 'record'
}

export interface ParamSpec {
  name: string
  type: string
  required: boolean
  description: string
}

export interface NodeSpec {
  name: string
  category: string // 'input' | 'transform' | 'output' | 'external' | 'compute' | ...
  color: string
  agent_hint: string
  description: string
  ports: {
    inputs: Port[]
    outputs: Port[]
  }
  params: ParamSpec[]
}

// SSE events from /run
export type RunEvent =
  | { node_id: string; status: 'running' }
  | { node_id: string; status: 'done'; output: string }
  | { node_id: string; status: 'error'; error: string }
  | { status: 'fatal'; error: string }
  | { status: 'complete' }
