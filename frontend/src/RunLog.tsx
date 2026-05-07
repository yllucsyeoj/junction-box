import { useEffect, useRef } from 'react'
import { RunEvent } from './types'

interface Props { events: RunEvent[] }

export default function RunLog({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div style={{
      background: '#f8f8f8',
      borderTop: '1px solid #ddd',
      padding: '8px 12px',
      overflow: 'auto',
      fontFamily: 'monospace',
      fontSize: 11,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ color: '#bbb', marginBottom: 6, letterSpacing: 1, fontSize: 9 }}>RUN LOG</div>
      {events.length === 0 && (
        <div style={{ color: '#ccc', fontSize: 11 }}>No runs yet — press ▶ Run to execute the pipeline</div>
      )}
      {events.map((event, i) => {
        if ('node_id' in event) {
          const color = event.status === 'running' ? '#d97706'
            : event.status === 'done' ? '#16a34a'
            : '#dc2626'
          const suffix = event.status === 'done' && 'output' in event
            ? ` → ${String(event.output).slice(0, 150)}`
            : event.status === 'error' && 'error' in event
            ? ` ✗ ${event.error}`
            : ''
          return (
            <div key={i} style={{ color, marginBottom: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              [{event.node_id}] {event.status}{suffix}
            </div>
          )
        }
        if (event.status === 'complete') {
          return (
            <div key={i} style={{ color: '#16a34a', marginTop: 4, borderTop: '1px solid #e5e5e5', paddingTop: 4 }}>
              — complete —
            </div>
          )
        }
        if (event.status === 'fatal') {
          return (
            <div key={i} style={{ color: '#dc2626' }}>
              FATAL: {(event as { status: 'fatal'; error: string }).error}
            </div>
          )
        }
        return null
      })}
      <div ref={bottomRef} />
    </div>
  )
}
