import { NodeSpec } from './types'

interface Props {
  selectedNodeId: string | null
  selectedNodeType: string | null
  nodeSpecs: NodeSpec[]
  params: Record<string, unknown>
  edgeConnectedParams: Set<string>
  onParamChange: (name: string, value: string) => void
}

export default function NodeConfig({
  selectedNodeId, selectedNodeType, nodeSpecs, params, edgeConnectedParams, onParamChange
}: Props) {
  if (!selectedNodeId || !selectedNodeType) {
    return (
      <div style={{ padding: 16, color: '#444', fontSize: 11 }}>
        Select a node to configure
      </div>
    )
  }

  const spec = nodeSpecs.find(s => s.name === selectedNodeType)
  if (!spec) return null

  return (
    <div style={{ padding: 12 }}>
      <div style={{ color: spec.color, fontWeight: 'bold', marginBottom: 2, fontSize: 13 }}>
        {spec.name}
      </div>
      <div style={{ color: '#555', fontSize: 10, marginBottom: 10, lineHeight: 1.4 }}>
        {spec.description}
      </div>

      {spec.params.length === 0 && (
        <div style={{ color: '#444', fontSize: 11 }}>No parameters</div>
      )}

      {spec.params.map(param => {
        const hasEdge = edgeConnectedParams.has(param.name)
        return (
          <div key={param.name} style={{ marginBottom: 10 }}>
            <label style={{
              display: 'flex', justifyContent: 'space-between',
              color: hasEdge ? '#555' : '#888', fontSize: 10, marginBottom: 3,
            }}>
              <span>{param.name}{param.required ? ' *' : ''}</span>
              {hasEdge && <span style={{ color: '#3b82f6' }}>← edge</span>}
            </label>
            <input
              value={hasEdge ? '(from edge)' : String(params[param.name] ?? '')}
              onChange={e => onParamChange(param.name, e.target.value)}
              disabled={hasEdge}
              placeholder={param.description}
              style={{
                width: '100%',
                background: hasEdge ? '#1e1e1e' : '#1a1a1a',
                border: `1px solid ${hasEdge ? '#2a2a2a' : '#333'}`,
                borderRadius: 3,
                padding: '4px 6px',
                color: hasEdge ? '#444' : '#e5e5e5',
                fontFamily: 'monospace',
                fontSize: 11,
                outline: 'none',
              }}
            />
          </div>
        )
      })}

      {/* Port type reference */}
      <div style={{ marginTop: 14, borderTop: '1px solid #222', paddingTop: 10 }}>
        <div style={{ color: '#333', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>PORTS</div>
        {[...spec.ports.inputs, ...spec.ports.outputs].map(port => (
          <div key={port.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#444', fontSize: 10 }}>{port.name}</span>
            <span style={{ color: '#555', fontSize: 10, fontStyle: 'italic' }}>{port.type}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, color: '#333', fontSize: 9, lineHeight: 1.4 }}>
        {spec.agent_hint}
      </div>
    </div>
  )
}
