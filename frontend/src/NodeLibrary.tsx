import { NodeSpec } from './types'

const CATEGORY_ORDER = ['input', 'transform', 'output', 'external', 'compute']

interface Props { specs: NodeSpec[] }

export default function NodeLibrary({ specs }: Props) {
  const knownCats = new Set(CATEGORY_ORDER)
  const extraCats = [...new Set(specs.map(s => s.category).filter(c => !knownCats.has(c)))].sort()
  const allCats = [...CATEGORY_ORDER, ...extraCats]

  const onDragStart = (e: React.DragEvent, name: string) => {
    e.dataTransfer.setData('application/gonude-node', name)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div style={{ padding: '10px 8px' }}>
      <div style={{ color: '#999', fontSize: 10, letterSpacing: 2, marginBottom: 10, paddingLeft: 4 }}>
        PRIMITIVES
      </div>
      {allCats.map(cat => {
        const items = specs.filter(s => s.category === cat)
        if (items.length === 0) return null
        return (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{
              color: '#aaa', fontSize: 9, textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 4, paddingLeft: 4,
            }}>
              {cat}
            </div>
            {items.map(spec => (
              <div
                key={spec.name}
                draggable
                onDragStart={e => onDragStart(e, spec.name)}
                title={spec.agent_hint}
                style={{
                  padding: '4px 8px',
                  marginBottom: 2,
                  borderRadius: 4,
                  borderLeft: `3px solid ${spec.color}`,
                  background: '#fff',
                  cursor: 'grab',
                  fontSize: 12,
                  color: '#333',
                  userSelect: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                {spec.name}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
