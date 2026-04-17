import { Handle, Position, NodeProps } from 'reactflow'
import { NodeSpec } from './types'

export const TYPE_COLORS: Record<string, string> = {
  table: '#3b82f6',
  string: '#22c55e',
  number: '#eab308',
  int: '#eab308',
  float: '#eab308',
  any: '#6b7280',
  nothing: '#374151',
  record: '#ec4899',
  list: '#8b5cf6',
}

export interface PrimitiveNodeData {
  type: string
  params: Record<string, unknown>
  spec: NodeSpec
  status: 'idle' | 'running' | 'done' | 'error'
}

export function PrimitiveNode({ data, selected }: NodeProps<PrimitiveNodeData>) {
  const borderColor = data.status === 'running' ? '#facc15'
    : data.status === 'done' ? '#22c55e'
    : data.status === 'error' ? '#ef4444'
    : data.spec?.color ?? '#6b7280'

  const inputs = data.spec?.ports?.inputs?.filter(p => p.type !== 'nothing') ?? []
  const outputs = data.spec?.ports?.outputs?.filter(p => p.type !== 'nothing') ?? []

  return (
    <div style={{
      background: '#2a2a2a',
      border: `2px solid ${borderColor}`,
      borderRadius: 6,
      minWidth: 140,
      padding: '6px 10px',
      fontFamily: 'monospace',
      fontSize: 12,
      outline: selected ? '2px solid #fff' : 'none',
      outlineOffset: 2,
      transition: 'border-color 0.2s',
      position: 'relative',
    }}>
      {inputs.map((port, i) => (
        <Handle
          key={port.name}
          type="target"
          position={Position.Left}
          id={port.name}
          style={{
            background: TYPE_COLORS[port.type] ?? '#6b7280',
            width: 10,
            height: 10,
            top: `${35 + i * 22}%`,
            border: '2px solid #1a1a1a',
          }}
        />
      ))}

      <div style={{ color: data.spec?.color ?? '#e5e5e5', fontWeight: 'bold', marginBottom: 1 }}>
        {data.type}
        {data.status === 'running' && (
          <span style={{ marginLeft: 6, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
        )}
      </div>
      <div style={{ color: '#555', fontSize: 10 }}>{data.spec?.category}</div>

      {outputs.map((port, i) => (
        <Handle
          key={port.name}
          type="source"
          position={Position.Right}
          id={port.name}
          style={{
            background: TYPE_COLORS[port.type] ?? '#6b7280',
            width: 10,
            height: 10,
            top: `${35 + i * 22}%`,
            border: '2px solid #1a1a1a',
          }}
        />
      ))}
    </div>
  )
}
