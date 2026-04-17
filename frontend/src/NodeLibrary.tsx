import { NodeSpec } from './types'

const CATEGORY_ORDER = ['input', 'transform', 'output', 'external', 'compute']

interface Props { specs: NodeSpec[] }

export default function NodeLibrary({ specs }: Props) {
  // Group by category, putting known categories first, then extras alphabetically
  const knownCats = new Set(CATEGORY_ORDER)
  const extraCats = [...new Set(specs.map(s => s.category).filter(c => !knownCats.has(c)))].sort()
  const allCats = [...CATEGORY_ORDER, ...extraCats]

  const onDragStart = (e: React.DragEvent, name: string) => {
    e.dataTransfer.setData('application/gonude-node', name)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div style={{ padding: '10px 8px' }}>
      <div style={{ color: '#444', fontSize: 10, letterSpacing: 2, marginBottom: 10, paddingLeft: 4 }}>
        PRIMITIVES
      </div>
      {allCats.map(cat => {
        const items = specs.filter(s => s.category === cat)
        if (items.length === 0) return null
        return (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{
              color: '#555', fontSize: 9, textTransform: 'uppercase',
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
                  background: '#252525',
                  cursor: 'grab',
                  fontSize: 12,
                  color: '#d4d4d4',
                  userSelect: 'none',
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
