import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { resolve } from 'node:path'
import { loadSpec } from './spec'
import { runPipeline, type SSEEvent } from './execute'

const app = new Hono()
app.use('/*', cors())

const ROOT = resolve(import.meta.dir, '..')

// Load node spec once at startup
console.log('Loading node spec...')
const nodeSpec = await loadSpec()
console.log(`Loaded ${nodeSpec.length} primitives`)

// GET /nodes — return full node spec array
app.get('/nodes', (c) => c.json(nodeSpec))

// POST /run — execute a NUON pipeline graph, stream SSE events
app.post('/run', async (c) => {
  const graph = await c.req.json()

  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const emit = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        await runPipeline(graph, emit)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'fatal', error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
})

// POST /parse-nuon — parse a NUON string and return JSON (for drag-to-load)
app.post('/parse-nuon', async (c) => {
  const nuonText = await c.req.text()
  const escaped = nuonText.replace(/'/g, "\\'")
  const proc = Bun.spawnSync(
    ['nu', '-c', `'${escaped}' | from nuon | to json`],
    { cwd: ROOT, stderr: 'pipe' }
  )
  if (proc.exitCode !== 0) {
    return c.json({ error: 'Invalid NUON', detail: Buffer.from(proc.stderr).toString() }, 400)
  }
  return c.json(JSON.parse(Buffer.from(proc.stdout).toString()))
})

export default { port: 3001, fetch: app.fetch }
