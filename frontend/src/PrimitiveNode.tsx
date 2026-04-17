import { Handle, Position, NodeProps } from 'reactflow'
import { NodeSpec } from './types'

export const TYPE_COLORS: Record<string, string> = {
  table: '#3b82f6',
  string: '#22c55e',
  number: '#eab308',
  int: '#eab308',
  float: '#eab308',
  any: '#9ca3af',
  nothing: '#d1d5db',
  record: '#ec4899',
  list: '#8b5cf6',
}

export interface PrimitiveNodeData {
  type: string
  params: Record<string, unknown>
  spec: NodeSpec
  status: 'idle' | 'running' | 'done' | 'error'
  output?: string
}

const PARAM_HANDLE_COLOR = '#94a3b8' // slate-400

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function PrimitiveNode({ data, selected }: NodeProps<PrimitiveNodeData>) {
  const borderColor = data.status === 'running' ? '#d97706'
    : data.status === 'done' ? '#16a34a'
    : data.status === 'error' ? '#dc2626'
    : data.spec?.color ?? '#9ca3af'

  const inputs = data.spec?.ports?.inputs?.filter(p => p.type !== 'nothing') ?? []
  const outputs = data.spec?.ports?.outputs?.filter(p => p.type !== 'nothing') ?? []
  const params = data.spec?.params ?? []

  // Visible param previews (non-empty values, up to 2)
  const paramPreviews = Object.entries(data.params ?? {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .slice(0, 2)

  // Output preview
  let outputPreview: string | null = null
  if (data.status === 'done' && data.output) {
    outputPreview = truncate(data.output.replace(/\n/g, ' '), 32)
  }

  // Total left-handle count: pipeline inputs + params
  const totalLeftHandles = inputs.length + params.length
  // Spacing in px between handles
  const handleSpacing = 22
  const nodeHeight = Math.max(56, 36 + totalLeftHandles * handleSpacing)

  return (
    <div style={{
      background: '#fff',
      border: `2px solid ${borderColor}`,
      borderRadius: 6,
      minWidth: 150,
      minHeight: nodeHeight,
      padding: '6px 10px 6px 14px',
      fontFamily: 'monospace',
      fontSize: 12,
      outline: selected ? `2px solid ${borderColor}` : 'none',
      outlineOffset: 3,
      transition: 'border-color 0.2s',
      position: 'relative',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    }}>
      {/* Pipeline input handles */}
      {inputs.map((port, i) => (
        <Handle
          key={port.name}
          type="target"
          position={Position.Left}
          id={port.name}
          style={{
            background: TYPE_COLORS[port.type] ?? '#9ca3af',
            width: 10,
            height: 10,
            top: 18 + i * handleSpacing,
            border: '2px solid #fff',
          }}
        />
      ))}

      {/* Param handles — left side, below pipeline inputs */}
      {params.map((param, i) => (
        <Handle
          key={`param-${param.name}`}
          type="target"
          position={Position.Left}
          id={param.name}
          style={{
            background: PARAM_HANDLE_COLOR,
            width: 8,
            height: 8,
            top: 18 + (inputs.length + i) * handleSpacing,
            border: '2px solid #fff',
          }}
        />
      ))}

      {/* Node header */}
      <div style={{ color: data.spec?.color ?? '#333', fontWeight: 'bold', marginBottom: 1 }}>
        {data.type}
        {data.status === 'running' && (
          <span style={{ marginLeft: 6, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
        )}
      </div>
      <div style={{ color: '#aaa', fontSize: 10, marginBottom: paramPreviews.length || outputPreview ? 4 : 0 }}>
        {data.spec?.category}
      </div>

      {/* Param value previews */}
      {paramPreviews.map(([k, v]) => (
        <div key={k} style={{ fontSize: 9, color: '#888', lineHeight: 1.4 }}>
          <span style={{ color: '#bbb' }}>{k}:</span> {truncate(String(v), 20)}
        </div>
      ))}

      {/* Output preview */}
      {outputPreview && (
        <div style={{ fontSize: 9, color: '#16a34a', marginTop: 2, lineHeight: 1.4 }}>
          → {outputPreview}
        </div>
      )}

      {/* Output handles */}
      {outputs.map((port, i) => (
        <Handle
          key={port.name}
          type="source"
          position={Position.Right}
          id={port.name}
          style={{
            background: TYPE_COLORS[port.type] ?? '#9ca3af',
            width: 10,
            height: 10,
            top: 18 + i * handleSpacing,
            border: '2px solid #fff',
          }}
        />
      ))}

      {/* Param handle labels (right-aligned on left side, for params only) */}
      {params.map((param, i) => (
        <div
          key={`label-${param.name}`}
          style={{
            position: 'absolute',
            left: 2,
            top: 18 + (inputs.length + i) * handleSpacing - 5,
            fontSize: 8,
            color: '#94a3b8',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {param.name}
        </div>
      ))}
    </div>
  )
}
