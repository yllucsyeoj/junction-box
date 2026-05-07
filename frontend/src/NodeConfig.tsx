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
      <div style={{ padding: 16, color: '#bbb', fontSize: 11 }}>
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
      <div style={{ color: '#888', fontSize: 10, marginBottom: 10, lineHeight: 1.4 }}>
        {spec.description}
      </div>

      {spec.params.length === 0 && (
        <div style={{ color: '#bbb', fontSize: 11 }}>No parameters</div>
      )}

      {spec.params.map(param => {
        const hasEdge = edgeConnectedParams.has(param.name)
        const currentValue = hasEdge ? '(from edge)' : String(params[param.name] ?? '')

        return (
          <div key={param.name} style={{ marginBottom: 10 }}>
            <label style={{
              display: 'flex', justifyContent: 'space-between',
              color: hasEdge ? '#bbb' : '#666', fontSize: 10, marginBottom: 3,
            }}>
              <span>{param.name}{param.required ? ' *' : ''}</span>
              {hasEdge && <span style={{ color: '#3b82f6' }}>← edge</span>}
            </label>

            {param.options && !hasEdge ? (
              <select
                value={String(params[param.name] ?? param.options[0])}
                onChange={e => onParamChange(param.name, e.target.value)}
                style={{
                  width: '100%',
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: 3,
                  padding: '4px 6px',
                  color: '#222',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  outline: 'none',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                }}
              >
                {param.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                value={currentValue}
                onChange={e => onParamChange(param.name, e.target.value)}
                disabled={hasEdge}
                placeholder={param.description}
                style={{
                  width: '100%',
                  background: hasEdge ? '#f5f5f5' : '#fff',
                  border: `1px solid ${hasEdge ? '#e5e5e5' : '#ccc'}`,
                  borderRadius: 3,
                  padding: '4px 6px',
                  color: hasEdge ? '#bbb' : '#222',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        )
      })}

      <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <div style={{ color: '#bbb', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>PORTS</div>
        {[...spec.ports.inputs, ...spec.ports.outputs].map(port => (
          <div key={port.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#666', fontSize: 10 }}>{port.name}</span>
            <span style={{ color: '#999', fontSize: 10, fontStyle: 'italic' }}>{port.type}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, color: '#aaa', fontSize: 9, lineHeight: 1.4 }}>
        {spec.agent_hint}
      </div>
    </div>
  )
}
