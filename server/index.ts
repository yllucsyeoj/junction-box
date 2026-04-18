import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { resolve } from 'node:path'
import { writeFileSync, readFileSync, unlinkSync, readdirSync, existsSync } from 'node:fs'
import { loadSpec } from './spec'
import { runPipeline, type SSEEvent } from './execute'
import { validateGraph } from './validate'
import { EXAMPLES } from './examples'

const app = new Hono()
app.use('/*', cors())

const ROOT = resolve(import.meta.dir, '..')
const PATCHES_DIR = resolve(ROOT, 'patches')

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
// GET /defs — full node catalogue for model bootstrapping
// GET /defs/:type — single node definition with example
//
// Richer than /nodes: includes wirable flags per param and example graphs.
// Models should call this once to learn the full primitive vocabulary.
// ---------------------------------------------------------------------------
app.get('/defs/:type', (c) => {
  const typeName = c.req.param('type')
  const spec = nodeSpec.find(s => s.name === typeName)
  if (!spec) return c.json({ error: `Unknown node type: "${typeName}"` }, 404)
  const example = EXAMPLES[typeName.replace(/-/g, '_')] ?? EXAMPLES[typeName] ?? null
  return c.json({ ...spec, example })
})

app.get('/defs', (c) => {
  const full = nodeSpec.map(s => ({
    ...s,
    example: EXAMPLES[s.name.replace(/-/g, '_')] ?? EXAMPLES[s.name] ?? null,
  }))
  return c.json(full)
})

// ---------------------------------------------------------------------------
// POST /exec — synchronous agent endpoint
//
// Accepts (three forms):
//   Content-Type: text/plain           → raw NUON file (parsed via Nu)
//   Content-Type: application/json     → Graph JSON directly
//   Body: {"alias": "my-patch"}        → run a stored patch by alias
//
// Returns: application/json
//   { status: "complete", outputs: { nodeId: nuonString }, result: nuonString | null }
//   { status: "error", validation_errors: [...], errors: {...}, skipped: [...], fatal, result: null }
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
    const body = await c.req.json()
    // Support alias shorthand: {"alias": "my-patch"}
    if (body && typeof body === 'object' && 'alias' in body) {
      const aliasPath = resolve(PATCHES_DIR, `${body.alias}.json`)
      if (!existsSync(aliasPath)) {
        return c.json({ status: 'error', fatal: `Patch alias "${body.alias}" not found. Use GET /patches to list available patches.`, errors: {}, validation_errors: [], skipped: [], outputs: {}, result: null }, 404)
      }
      graph = JSON.parse(readFileSync(aliasPath, 'utf8')).graph
    } else {
      graph = body
    }
  } else {
    // Treat body as raw NUON text
    const nuonText = await c.req.text()
    const parsed = nuonToGraph(nuonText)
    if (!parsed.ok) {
      return c.json({ status: 'error', fatal: `NUON parse error: ${parsed.error}`, errors: {}, validation_errors: [], skipped: [], outputs: {}, result: null }, 400)
    }
    graph = parsed.graph
  }

  // Pre-execution validation
  const validationErrors = validateGraph(graph as any, nodeSpec)
  if (validationErrors.length > 0) {
    return c.json({
      status: 'error',
      fatal: null,
      validation_errors: validationErrors,
      errors: {},
      skipped: [],
      outputs: {},
      result: null,
    }, 422)
  }

  const outputs: Record<string, string> = {}
  const errors: Record<string, { message: string; error_type: string }> = {}
  const skipped: string[] = []
  let fatalError: string | null = null

  try {
    await runPipeline(graph as any, (event: SSEEvent) => {
      if ('node_id' in event) {
        if (event.status === 'done') outputs[event.node_id] = event.output
        if (event.status === 'error') errors[event.node_id] = { message: event.error, error_type: event.error_type }
        if (event.status === 'skipped') skipped.push(event.node_id)
      }
      if ('status' in event && event.status === 'fatal') {
        fatalError = (event as { status: 'fatal'; error: string }).error
      }
    })
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err)
  }

  if (fatalError || Object.keys(errors).length > 0) {
    return c.json({ status: 'error', errors, fatal: fatalError, validation_errors: [], skipped, outputs, result: null }, 500)
  }

  // Find the "result" value: first return node, or last node in execution order
  const g = graph as { nodes: Array<{ id: string; type: string }> }
  const returnNode = g.nodes.find(n => n.type === 'return')
  const result = returnNode
    ? (outputs[returnNode.id] ?? null)
    : (Object.values(outputs).at(-1) ?? null)

  return c.json({ status: 'complete', validation_errors: [], errors: {}, skipped, outputs, result })
})

// ---------------------------------------------------------------------------
// POST /patch — store a patch with an alias
// GET  /patch/:alias — retrieve a stored patch
// GET  /patches — list all stored patches
// ---------------------------------------------------------------------------
app.post('/patch', async (c) => {
  const body = await c.req.json()
  const { alias, description, graph } = body

  if (!alias || typeof alias !== 'string' || !/^[a-z0-9_-]+$/.test(alias)) {
    return c.json({ error: 'alias must be a lowercase alphanumeric string (hyphens/underscores ok)' }, 400)
  }
  if (!graph || typeof graph !== 'object') {
    return c.json({ error: 'graph is required' }, 400)
  }

  // Validate before storing
  const validationErrors = validateGraph(graph as any, nodeSpec)
  if (validationErrors.length > 0) {
    return c.json({ error: 'Graph validation failed — patch not stored.', validation_errors: validationErrors }, 422)
  }

  const record = { alias, description: description ?? '', graph, created_at: new Date().toISOString() }
  writeFileSync(resolve(PATCHES_DIR, `${alias}.json`), JSON.stringify(record, null, 2))
  return c.json({ ok: true, alias })
})

app.get('/patch/:alias', (c) => {
  const alias = c.req.param('alias')
  const filePath = resolve(PATCHES_DIR, `${alias}.json`)
  if (!existsSync(filePath)) {
    return c.json({ error: `Patch "${alias}" not found.` }, 404)
  }
  return c.json(JSON.parse(readFileSync(filePath, 'utf8')))
})

app.get('/patches', (c) => {
  const files = existsSync(PATCHES_DIR)
    ? readdirSync(PATCHES_DIR).filter(f => f.endsWith('.json') && f !== '.gitkeep.json')
    : []
  const list = files.map(f => {
    try {
      const { alias, description, created_at } = JSON.parse(readFileSync(resolve(PATCHES_DIR, f), 'utf8'))
      return { alias, description, created_at }
    } catch { return null }
  }).filter(Boolean)
  return c.json(list)
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
