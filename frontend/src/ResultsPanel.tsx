interface Props {
  nodeOutputs: Record<string, string>  // nodeId -> NUON string
  nodeTypes: Record<string, string>    // nodeId -> type name
}

function parseOutput(raw: string): { type: 'table'; rows: Record<string, unknown>[] } | { type: 'value'; value: unknown } | { type: 'raw'; text: string } {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      return { type: 'table', rows: parsed }
    }
    return { type: 'value', value: parsed }
  } catch {
    return { type: 'raw', text: raw }
  }
}

function OutputTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0] ?? {})
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%', fontFamily: 'monospace' }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{
                textAlign: 'left', padding: '3px 8px', background: '#f0f0f0',
                borderBottom: '1px solid #ddd', color: '#555', fontWeight: 600,
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '3px 8px', borderBottom: '1px solid #f0f0f0', color: '#333' }}>
                  {String(row[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ResultsPanel({ nodeOutputs, nodeTypes }: Props) {
  const entries = Object.entries(nodeOutputs)

  if (entries.length === 0) {
    return (
      <div style={{ padding: 16, color: '#bbb', fontSize: 11 }}>
        No results yet — run the pipeline to see outputs here
      </div>
    )
  }

  // Show display nodes first
  const sorted = [...entries].sort(([, , ], [bId]) => {
    return nodeTypes[bId] === 'display' ? 1 : -1
  })

  return (
    <div style={{ padding: 8 }}>
      {sorted.map(([nodeId, raw]) => {
        const typeName = nodeTypes[nodeId] ?? nodeId
        const parsed = parseOutput(raw)
        const isDisplay = typeName === 'display'

        return (
          <div key={nodeId} style={{
            marginBottom: 12,
            border: `1px solid ${isDisplay ? '#16a34a' : '#e5e5e5'}`,
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '4px 8px',
              background: isDisplay ? '#f0fdf4' : '#f8f8f8',
              borderBottom: '1px solid #e5e5e5',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: isDisplay ? '#16a34a' : '#666', fontWeight: 600 }}>
                {nodeId} <span style={{ color: '#aaa', fontWeight: 400 }}>({typeName})</span>
              </span>
              {parsed.type === 'table' && (
                <span style={{ fontSize: 9, color: '#999' }}>{parsed.rows.length} rows</span>
              )}
            </div>
            <div style={{ padding: 8, background: '#fff' }}>
              {parsed.type === 'table' && <OutputTable rows={parsed.rows} />}
              {parsed.type === 'value' && (
                <pre style={{ margin: 0, fontSize: 11, color: '#333', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify(parsed.value, null, 2)}
                </pre>
              )}
              {parsed.type === 'raw' && (
                <pre style={{ margin: 0, fontSize: 10, color: '#555', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                  {parsed.text}
                </pre>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
