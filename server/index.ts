import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { resolve } from 'node:path'
import { writeFileSync, unlinkSync } from 'node:fs'
import { loadSpec } from './spec'
import { runPipeline, type SSEEvent } from './execute'

const app = new Hono()
app.use('/*', cors())

const ROOT = resolve(import.meta.dir, '..')

// Load node spec once at startup
console.log('Loading node spec...')
const nodeSpec = await loadSpec()
console.log(`Loaded ${nodeSpec.length} primitives`)

// ---------------------------------------------------------------------------
// Utility: parse a NUON string into a Graph object.
// Writes to a temp .nuon file so Nu's `open` can detect the format by
// extension — this handles both NUON and JSON-compatible syntax reliably.
// ---------------------------------------------------------------------------
function nuonToGraph(nuonText: string): { ok: true; graph: unknown } | { ok: false; error: string } {
  const tmpPath = `/tmp/gonude-parse-${Date.now()}-${Math.random().toString(36).slice(2)}.nuon`
  try {
    writeFileSync(tmpPath, nuonText)
    const proc = Bun.spawnSync(['nu', '-c', `open '${tmpPath}' | to json`], {
      cwd: ROOT,
      stderr: 'pipe',
    })
    if (proc.exitCode !== 0) {
      return { ok: false, error: Buffer.from(proc.stderr).toString().trim() }
    }
    return { ok: true, graph: JSON.parse(Buffer.from(proc.stdout).toString()) }
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
}

// ---------------------------------------------------------------------------
// GET /nodes — full node spec (what primitives exist, their ports + params)
// ---------------------------------------------------------------------------
app.get('/nodes', (c) => c.json(nodeSpec))

// ---------------------------------------------------------------------------
// POST /run — SSE stream for the frontend canvas
// Accepts: application/json (Graph)
// Returns: text/event-stream
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /exec — synchronous agent endpoint
//
// Accepts:
//   Content-Type: text/plain           → raw NUON file (parsed via Nu)
//   Content-Type: application/json     → Graph JSON directly
//
// Returns: application/json
//   { status: "complete", outputs: { nodeId: nuonString }, result: nuonString | null }
//   { status: "error",    errors:  { nodeId: errorMsg },  fatal: string | null }
//
// The "result" field contains the output of the first "return" node, or the
// last node's output if no return node is present.  This is the value agents
// most commonly want.
//
// Example (curl):
//   curl -s -X POST http://localhost:3001/exec \
//        -H "Content-Type: text/plain" \
//        --data-binary @my-pipeline.nuon | jq .result
// ---------------------------------------------------------------------------
app.post('/exec', async (c) => {
  const contentType = c.req.header('content-type') ?? ''

  let graph: unknown
  if (contentType.includes('application/json')) {
    graph = await c.req.json()
  } else {
    // Treat body as raw NUON text
    const nuonText = await c.req.text()
    const parsed = nuonToGraph(nuonText)
    if (!parsed.ok) {
      return c.json({ status: 'error', fatal: `NUON parse error: ${parsed.error}`, errors: {}, outputs: {}, result: null }, 400)
    }
    graph = parsed.graph
  }

  const outputs: Record<string, string> = {}
  const errors: Record<string, string> = {}
  let fatalError: string | null = null

  try {
    await runPipeline(graph as any, (event: SSEEvent) => {
      if ('node_id' in event) {
        if (event.status === 'done') outputs[event.node_id] = event.output
        if (event.status === 'error') errors[event.node_id] = event.error
      }
      if ('status' in event && event.status === 'fatal') {
        fatalError = (event as { status: 'fatal'; error: string }).error
      }
    })
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err)
  }

  if (fatalError || Object.keys(errors).length > 0) {
    return c.json({ status: 'error', errors, fatal: fatalError, outputs, result: null }, 500)
  }

  // Find the "result" value: first return node, or last node in execution order
  const g = graph as { nodes: Array<{ id: string; type: string }> }
  const returnNode = g.nodes.find(n => n.type === 'return')
  const result = returnNode
    ? (outputs[returnNode.id] ?? null)
    : (Object.values(outputs).at(-1) ?? null)

  return c.json({ status: 'complete', outputs, result })
})

// ---------------------------------------------------------------------------
// POST /parse-nuon — convert NUON to JSON (used by frontend drag-to-load)
// ---------------------------------------------------------------------------
app.post('/parse-nuon', async (c) => {
  const nuonText = await c.req.text()
  const parsed = nuonToGraph(nuonText)
  if (!parsed.ok) {
    return c.json({ error: 'Invalid NUON', detail: parsed.error }, 400)
  }
  return c.json(parsed.graph)
})

export default { port: 3001, fetch: app.fetch }
