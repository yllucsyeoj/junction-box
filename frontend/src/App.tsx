import { useState, useCallback, useEffect } from 'react'
import { NodeSpec, Graph, RunEvent } from './types'
import Canvas from './Canvas'
import NodeLibrary from './NodeLibrary'
import NodeConfig from './NodeConfig'
import RunLog from './RunLog'
import ResultsPanel from './ResultsPanel'

const LAYOUT = {
  library: 200,
  config: 260,
  runLog: 180,
}

export default function App() {
  const [nodeSpecs, setNodeSpecs] = useState<NodeSpec[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)
  const [runEvents, setRunEvents] = useState<RunEvent[]>([])
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({})
  const [nodeParams, setNodeParams] = useState<Record<string, Record<string, unknown>>>({})
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, string>>({})
  const [nodeTypes, setNodeTypes] = useState<Record<string, string>>({})
  const [edgeConnectedParams, setEdgeConnectedParams] = useState<Set<string>>(new Set())
  const [rightTab, setRightTab] = useState<'config' | 'results'>('config')

  useEffect(() => {
    fetch('/nodes').then(r => r.json()).then(setNodeSpecs).catch(console.error)
  }, [])

  const handleSelectNode = useCallback((id: string | null, type: string | null, connectedParams: Set<string>) => {
    setSelectedNodeId(id)
    setSelectedNodeType(type)
    setEdgeConnectedParams(connectedParams)
  }, [])

  const handleNodeAdded = useCallback((id: string, params: Record<string, unknown>, type: string) => {
    setNodeParams(prev => ({ ...prev, [id]: params }))
    setNodeTypes(prev => ({ ...prev, [id]: type }))
    setSelectedNodeId(id)
    setSelectedNodeType(type)
    setEdgeConnectedParams(new Set())
  }, [])

  const handleParamChange = useCallback((name: string, value: string) => {
    if (!selectedNodeId) return
    setNodeParams(prev => ({
      ...prev,
      [selectedNodeId]: { ...(prev[selectedNodeId] ?? {}), [name]: value }
    }))
  }, [selectedNodeId])

  const handleRun = useCallback((graph: Graph) => {
    setRunEvents([])
    setNodeStatuses({})
    setNodeOutputs({})

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
              if (event.status === 'done' && 'output' in event) {
                setNodeOutputs(prev => ({ ...prev, [event.node_id]: event.output }))
              }
            }
            if ('status' in event && event.status === 'complete') {
              setRightTab('results')
            }
          } catch {}
        }
      }
    }).catch(err => {
      setRunEvents(prev => [...prev, { status: 'fatal', error: String(err) }])
    })
  }, [])

  const selectedParams = selectedNodeId ? (nodeParams[selectedNodeId] ?? {}) : {}
  const resultCount = Object.keys(nodeOutputs).length

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${LAYOUT.library}px 1fr ${LAYOUT.config}px`,
      gridTemplateRows: `1fr ${LAYOUT.runLog}px`,
      height: '100vh',
      overflow: 'hidden',
      background: '#f0f0f0',
    }}>
      {/* Left panel: Node Library */}
      <div style={{
        gridColumn: '1',
        gridRow: '1 / 3',
        background: '#fafafa',
        borderRight: '1px solid #ddd',
        overflow: 'auto',
      }}>
        <NodeLibrary specs={nodeSpecs} />
      </div>

      {/* Center: Canvas */}
      <div style={{ gridColumn: '2', gridRow: '1', width: '100%', height: '100%', overflow: 'hidden' }}>
        <Canvas
          nodeSpecs={nodeSpecs}
          nodeStatuses={nodeStatuses}
          appNodeParams={nodeParams}
          appNodeOutputs={nodeOutputs}
          onSelectNode={handleSelectNode}
          onRun={handleRun}
          onNodeAdded={handleNodeAdded}
        />
      </div>

      {/* Right panel: tabbed Config / Results */}
      <div style={{
        gridColumn: '3',
        gridRow: '1 / 3',
        background: '#fafafa',
        borderLeft: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd', flexShrink: 0 }}>
          {(['config', 'results'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setRightTab(tab)}
              style={{
                flex: 1,
                padding: '7px 0',
                background: rightTab === tab ? '#fff' : '#fafafa',
                border: 'none',
                borderBottom: rightTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: 10,
                color: rightTab === tab ? '#2563eb' : '#888',
                fontWeight: rightTab === tab ? 600 : 400,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {tab === 'results' && resultCount > 0 ? `Results (${resultCount})` : tab === 'results' ? 'Results' : 'Config'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {rightTab === 'config' ? (
            <NodeConfig
              selectedNodeId={selectedNodeId}
              selectedNodeType={selectedNodeType}
              nodeSpecs={nodeSpecs}
              params={selectedParams}
              edgeConnectedParams={edgeConnectedParams}
              onParamChange={handleParamChange}
            />
          ) : (
            <ResultsPanel nodeOutputs={nodeOutputs} nodeTypes={nodeTypes} />
          )}
        </div>
      </div>

      {/* Bottom: Run Log */}
      <div style={{ gridColumn: '2', gridRow: '2', overflow: 'auto' }}>
        <RunLog events={runEvents} />
      </div>
    </div>
  )
}
