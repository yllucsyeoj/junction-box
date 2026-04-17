import { useCallback, useRef, useState } from 'react'
import ReactFlow, {
  Node, Edge, Connection, addEdge,
  useNodesState, useEdgesState,
  Controls, Background, ReactFlowInstance,
} from 'reactflow'
import { PrimitiveNode, PrimitiveNodeData } from './PrimitiveNode'
import { NodeSpec, Graph } from './types'

const nodeTypes = { primitiveNode: PrimitiveNode }
let idCounter = 0
const newId = () => `node_${++idCounter}`

interface Props {
  nodeSpecs: NodeSpec[]
  nodeStatuses: Record<string, 'idle' | 'running' | 'done' | 'error'>
  appNodeParams: Record<string, Record<string, unknown>>
  onSelectNode: (id: string | null, type: string | null) => void
  onRun: (graph: Graph) => void
  onNodeAdded: (id: string, params: Record<string, unknown>, type: string) => void
}

export default function Canvas({ nodeSpecs, nodeStatuses, appNodeParams, onSelectNode, onRun, onNodeAdded }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<PrimitiveNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Typed edge enforcement
  const isValidConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)
    if (!sourceNode || !targetNode) return false

    const srcSpec = nodeSpecs.find(s => s.name === sourceNode.data.type)
    const tgtSpec = nodeSpecs.find(s => s.name === targetNode.data.type)
    if (!srcSpec || !tgtSpec) return false

    const srcPort = srcSpec.ports.outputs.find(p => p.name === (connection.sourceHandle ?? 'output'))
    const tgtPort = tgtSpec.ports.inputs.find(p => p.name === (connection.targetHandle ?? 'input'))
    if (!srcPort || !tgtPort) return false

    // 'any' is compatible with everything
    return srcPort.type === 'any' || tgtPort.type === 'any' || srcPort.type === tgtPort.type
  }, [nodes, nodeSpecs])

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, animated: true }, eds))
  }, [setEdges])

  // Merge app param state into node data for rendering
  const displayNodes = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      params: { ...n.data.params, ...(appNodeParams[n.id] ?? {}) },
      status: nodeStatuses[n.id] ?? 'idle',
    }
  }))

  // Drag from library panel onto canvas
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const nodeType = e.dataTransfer.getData('application/gonude-node')
    if (!nodeType || !rfInstance || !wrapperRef.current) return

    const bounds = wrapperRef.current.getBoundingClientRect()
    const position = rfInstance.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
    const spec = nodeSpecs.find(s => s.name === nodeType)
    if (!spec) return

    const defaultParams = Object.fromEntries(spec.params.map(p => [p.name, '']))
    const id = newId()

    const newNode: Node<PrimitiveNodeData> = {
      id,
      type: 'primitiveNode',
      position,
      data: { type: nodeType, params: defaultParams, spec, status: 'idle' },
    }
    setNodes(nds => [...nds, newNode])
    onNodeAdded(id, defaultParams, nodeType)
  }, [rfInstance, nodeSpecs, setNodes, onNodeAdded])

  // Drag-to-load NUON file
  const onFileDrop = useCallback((e: React.DragEvent) => {
    const file = e.dataTransfer.files[0]
    if (!file?.name.endsWith('.nuon')) return
    e.preventDefault()
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      fetch('/parse-nuon', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      }).then(r => r.json()).then((graph: Graph) => {
        const flowNodes: Node<PrimitiveNodeData>[] = graph.nodes.map(n => {
          const spec = nodeSpecs.find(s => s.name === n.type) ?? {
            name: n.type, category: 'unknown', color: '#6b7280',
            agent_hint: '', description: '',
            ports: { inputs: [{ name: 'input', type: 'any' }], outputs: [{ name: 'output', type: 'any' }] },
            params: [],
          }
          return {
            id: n.id,
            type: 'primitiveNode',
            position: n.position,
            data: { type: n.type, params: n.params, spec, status: 'idle' as const },
          }
        })
        const flowEdges: Edge[] = graph.edges.map(e => ({
          id: e.id,
          source: e.from,
          sourceHandle: e.from_port,
          target: e.to,
          targetHandle: e.to_port,
          animated: true,
        }))
        setNodes(flowNodes)
        setEdges(flowEdges)
      }).catch(console.error)
    }
    reader.readAsText(file)
  }, [nodeSpecs, setNodes, setEdges])

  // Build graph from current canvas state
  const buildGraph = useCallback((): Graph => ({
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.data.type,
      position: n.position,
      params: { ...n.data.params, ...(appNodeParams[n.id] ?? {}) },
    })),
    edges: edges.map(e => ({
      id: e.id,
      from: e.source,
      from_port: e.sourceHandle ?? 'output',
      to: e.target,
      to_port: e.targetHandle ?? 'input',
    }))
  }), [nodes, edges, appNodeParams])

  const handleSave = useCallback(() => {
    const graph = buildGraph()
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'pipeline.nuon'
    a.click()
  }, [buildGraph])

  const handleRun = useCallback(() => onRun(buildGraph()), [onRun, buildGraph])

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', height: '100%' }}
      onDragOver={onDragOver}
      onDrop={onFileDrop}
    >
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', gap: 8,
      }}>
        <button
          onClick={handleRun}
          style={{
            background: '#22c55e', color: '#000', border: 'none', borderRadius: 4,
            padding: '6px 18px', cursor: 'pointer', fontFamily: 'monospace',
            fontWeight: 'bold', fontSize: 13,
          }}
        >
          ▶ Run
        </button>
        <button
          onClick={handleSave}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4,
            padding: '6px 14px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 13,
          }}
        >
          ↓ Save NUON
        </button>
      </div>

      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onInit={setRfInstance}
        onNodeClick={(_, node) => onSelectNode(node.id, node.data.type)}
        onPaneClick={() => onSelectNode(null, null)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
      >
        <Controls />
        <Background color="#333" gap={16} />
      </ReactFlow>
    </div>
  )
}
