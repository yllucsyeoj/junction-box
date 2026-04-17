import { useState, useCallback, useEffect } from 'react'
import { NodeSpec, Graph, RunEvent } from './types'
import Canvas from './Canvas'
import NodeLibrary from './NodeLibrary'
import NodeConfig from './NodeConfig'
import RunLog from './RunLog'

const LAYOUT = {
  library: 200,
  config: 250,
  runLog: 180,
}

export default function App() {
  const [nodeSpecs, setNodeSpecs] = useState<NodeSpec[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)
  const [runEvents, setRunEvents] = useState<RunEvent[]>([])
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({})
  // nodeParams: per-node UI param values, keyed by node ID
  const [nodeParams, setNodeParams] = useState<Record<string, Record<string, unknown>>>({})
  // edgeConnectedParams: which params have an incoming edge (set by Canvas)
  const [edgeConnectedParams, setEdgeConnectedParams] = useState<Set<string>>(new Set())

  // Fetch node specs on mount
  useEffect(() => {
    fetch('/nodes').then(r => r.json()).then(setNodeSpecs).catch(console.error)
  }, [])

  const handleSelectNode = useCallback((id: string | null, type: string | null) => {
    setSelectedNodeId(id)
    setSelectedNodeType(type)
  }, [])

  const handleNodeAdded = useCallback((id: string, params: Record<string, unknown>, type: string) => {
    setNodeParams(prev => ({ ...prev, [id]: params }))
    setSelectedNodeId(id)
    setSelectedNodeType(type)
  }, [])

  const handleParamChange = useCallback((name: string, value: string) => {
    if (!selectedNodeId) return
    setNodeParams(prev => ({
      ...prev,
      [selectedNodeId]: { ...(prev[selectedNodeId] ?? {}), [name]: value }
    }))
  }, [selectedNodeId])

  // Run pipeline via POST + SSE ReadableStream
  const handleRun = useCallback((graph: Graph) => {
    setRunEvents([])
    setNodeStatuses({})

    fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph),
    }).then(async res => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event: RunEvent = JSON.parse(line.slice(6))
            setRunEvents(prev => [...prev, event])
            if ('node_id' in event) {
              setNodeStatuses(prev => ({ ...prev, [event.node_id]: event.status as 'running' | 'done' | 'error' }))
            }
          } catch {}
        }
      }
    }).catch(err => {
      setRunEvents(prev => [...prev, { status: 'fatal', error: String(err) }])
    })
  }, [])

  const selectedParams = selectedNodeId ? (nodeParams[selectedNodeId] ?? {}) : {}

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${LAYOUT.library}px 1fr ${LAYOUT.config}px`,
      gridTemplateRows: `1fr ${LAYOUT.runLog}px`,
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Left panel: Node Library */}
      <div style={{
        gridRow: '1 / 3',
        background: '#1e1e1e',
        borderRight: '1px solid #2a2a2a',
        overflow: 'auto',
      }}>
        <NodeLibrary specs={nodeSpecs} />
      </div>

      {/* Center: Canvas */}
      <Canvas
        nodeSpecs={nodeSpecs}
        nodeStatuses={nodeStatuses}
        appNodeParams={nodeParams}
        onSelectNode={handleSelectNode}
        onRun={handleRun}
        onNodeAdded={handleNodeAdded}
      />

      {/* Right panel: Node Config */}
      <div style={{
        gridRow: '1 / 3',
        background: '#1e1e1e',
        borderLeft: '1px solid #2a2a2a',
        overflow: 'auto',
      }}>
        <NodeConfig
          selectedNodeId={selectedNodeId}
          selectedNodeType={selectedNodeType}
          nodeSpecs={nodeSpecs}
          params={selectedParams}
          edgeConnectedParams={edgeConnectedParams}
          onParamChange={handleParamChange}
        />
      </div>

      {/* Bottom: Run Log (spans canvas column only) */}
      <div style={{ gridColumn: '2', overflow: 'auto' }}>
        <RunLog events={runEvents} />
      </div>
    </div>
  )
}
