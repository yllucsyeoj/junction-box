import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { resolve } from 'node:path'
import { writeFileSync, readFileSync, appendFileSync, unlinkSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { loadSpec } from './spec'
import { runPipeline, type SSEEvent, type NodeRunRecord } from './execute'
import { validateGraph } from './validate'
import { EXAMPLES } from './examples'

const app = new Hono()
app.use('/*', cors())

const ROOT = resolve(import.meta.dir, '..')
const DATA_DIR = process.env.GONUDE_DATA_DIR ? resolve(process.env.GONUDE_DATA_DIR) : resolve(ROOT, 'data')
const PATCHES_DIR = resolve(DATA_DIR, 'patches')
const LOG_FILE = resolve(DATA_DIR, 'runs.jsonl')
const SERVER_START = Date.now()

function makeRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// Ensure data directories exist (important for fresh Docker volumes)
mkdirSync(PATCHES_DIR, { recursive: true })

// Load node spec once at startup
console.log('Loading node spec...')
const nodeSpec = await loadSpec()
console.log(`Loaded ${nodeSpec.length} primitives`)
console.log(`Data directory: ${DATA_DIR}`)

// ---------------------------------------------------------------------------
// Utility: append a structured log entry to runs.jsonl
// ---------------------------------------------------------------------------
function logRun(entry: Record<string, unknown>, nodes?: NodeRunRecord[]): void {
  try {
    const record: Record<string, unknown> = { ts: new Date().toISOString(), ...entry }
    if (nodes && nodes.length > 0) record.nodes = nodes
    appendFileSync(LOG_FILE, JSON.stringify(record) + '\n')
  } catch {
    // Non-fatal — don't let logging break execution
  }
}

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
// GET / — agent-oriented API manifest
// The first thing a model should call to understand this API.
// ---------------------------------------------------------------------------
app.get('/', (c) => c.json({
  name: 'GoNude Pipeline API',
  description: 'Node-based dataflow engine. POST a graph of nodes+edges to /exec and get back results. Call GET /defs first to learn all available node types.',
  quick_start: [
    '1. GET /defs — fetch all node types with schemas and example graphs',
    '2. POST /exec with {nodes, edges} — run a pipeline synchronously, get back {result}',
    '3. POST /patch to save a working graph; GET /patches to list saved ones',
  ],
  endpoints: {
    'GET /': 'This manifest — start here',
    'GET /health': 'Server status, uptime, primitive count',
    'GET /defs': 'Full node catalogue: all types, ports, params, wirable flags, example graphs — call this before building any graph',
    'GET /defs/:type': 'Single node definition + example',
    'GET /nodes': 'Raw node spec (no examples — prefer /defs)',
    'POST /exec': 'Run a graph synchronously → {status, result, outputs, errors}. Accepts JSON graph or NUON (text/plain) or {alias: "name"}',
    'POST /run': 'Run a graph, stream SSE events per node (for frontend use)',
    'GET /patches': 'List saved patches (alias, description, node_types, created_at)',
    'GET /patch/:alias': 'Retrieve a saved patch',
    'POST /patch': 'Save a graph as a named patch — body: {alias, description, graph}',
    'DELETE /patch/:alias': 'Delete a saved patch',
    'GET /logs': 'Recent execution log entries',
    'POST /parse-nuon': 'Convert NUON text to JSON graph',
  },
  graph_format: {
    nodes: [{ id: 'string', type: 'node-type-name', params: { param_name: 'value' } }],
    edges: [{ id: 'string', from: 'node-id', from_port: 'output', to: 'node-id', to_port: 'input' }],
  },
  gotchas: [
    '`get` is single-level only — for nested keys like financials.revenue, chain two get nodes',
    'Column names are exact-match and case-sensitive — screener/snapshot output uses snake_case (market_cap, not marketCap); run and inspect raw output when unsure',
    'Some columns contain NUON symbol/atom values (e.g. sec-insider `code` column: S, P, F) — `filter` cannot compare these; use `each` with a Nu expression instead',
    'Disconnected nodes (no incoming edge) still execute with null input and error silently — they do not halt the graph; always wire every node',
    'A `return` node with no incoming edge runs immediately with null — always wire terminal nodes last',
    '`str-interp` takes a record as input and substitutes {field} placeholders — works cleanly with market-snapshot and similar record-output nodes',
    'POST /exec is the agent endpoint — synchronous, returns JSON with run_id; POST /run streams SSE and is for frontend use',
    'YouTube nodes (youtube-channel, youtube-search, etc.) scrape youtube.com directly — they require outbound internet access; they will fail with "Network failure" in network-restricted environments',
    'The llm node requires ANTHROPIC_API_KEY in the server process environment — pass it via docker run -e ANTHROPIC_API_KEY=... or set it in the shell before starting the server',
  ],
}))

// ---------------------------------------------------------------------------
// GET /health — uptime, version, primitive count
// ---------------------------------------------------------------------------
app.get('/health', (c) => c.json({
  status: 'ok',
  uptime_ms: Date.now() - SERVER_START,
  primitives: nodeSpec.length,
  data_dir: DATA_DIR,
  api: 'GET / for full endpoint manifest and quick-start guide',
}))

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
  const run_id = makeRunId()
  const t0 = Date.now()

  let graph: unknown
  let alias: string | null = null

  if (contentType.includes('application/json')) {
    const body = await c.req.json()
    // Support alias shorthand: {"alias": "my-patch"}
    if (body && typeof body === 'object' && 'alias' in body) {
      alias = String(body.alias)
      const aliasPath = resolve(PATCHES_DIR, `${alias}.json`)
      if (!existsSync(aliasPath)) {
        logRun({ type: 'exec', run_id, alias, status: 'error', fatal: 'patch_not_found', duration_ms: Date.now() - t0 })
        return c.json({ status: 'error', run_id, fatal: `Patch alias "${alias}" not found. Use GET /patches to list available patches.`, errors: {}, validation_errors: [], skipped: [], outputs: {}, result: null }, 404)
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
      logRun({ type: 'exec', run_id, alias, status: 'error', fatal: 'nuon_parse_error', duration_ms: Date.now() - t0 })
      return c.json({ status: 'error', run_id, fatal: `NUON parse error: ${parsed.error}`, errors: {}, validation_errors: [], skipped: [], outputs: {}, result: null }, 400)
    }
    graph = parsed.graph
  }

  // Pre-execution validation
  const validationErrors = validateGraph(graph as any, nodeSpec)
  if (validationErrors.length > 0) {
    logRun({ type: 'exec', run_id, alias, status: 'error', fatal: 'validation', node_count: (graph as any)?.nodes?.length ?? 0, duration_ms: Date.now() - t0 })
    return c.json({
      status: 'error',
      run_id,
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
  let nodeRecords: NodeRunRecord[] = []

  try {
    nodeRecords = await runPipeline(graph as any, (event: SSEEvent) => {
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

  const g = graph as { nodes: Array<{ id: string; type: string }> }
  const nodeCount = g.nodes?.length ?? 0

  if (fatalError || Object.keys(errors).length > 0) {
    logRun({ type: 'exec', run_id, alias, status: 'error', node_count: nodeCount, error_count: Object.keys(errors).length, fatal: fatalError, duration_ms: Date.now() - t0 }, nodeRecords)
    return c.json({ status: 'error', run_id, errors, fatal: fatalError, validation_errors: [], skipped, outputs, result: null }, 500)
  }

  // Find the "result" value: first return node, or last node in execution order
  const returnNode = g.nodes.find(n => n.type === 'return')
  const result = returnNode
    ? (outputs[returnNode.id] ?? null)
    : (Object.values(outputs).at(-1) ?? null)

  logRun({ type: 'exec', run_id, alias, status: 'complete', node_count: nodeCount, duration_ms: Date.now() - t0 }, nodeRecords)
  return c.json({ status: 'complete', run_id, validation_errors: [], errors: {}, skipped, outputs, result })
})

// ---------------------------------------------------------------------------
// POST /patch — store a patch with an alias
// GET  /patch/:alias — retrieve a stored patch
// GET  /patches — list all stored patches (alias, description, node_types, created_at)
// DELETE /patch/:alias — remove a stored patch
// ---------------------------------------------------------------------------
app.post('/patch', async (c) => {
  const body = await c.req.json()
  const { alias, description, graph } = body

  if (!alias || typeof alias !== 'string' || !/^[a-z0-9_-]+$/.test(alias)) {
    return c.json({ error: 'alias must be a lowercase alphanumeric string (hyphens/underscores ok)' }, 400)
  }
  if (!description || typeof description !== 'string' || description.trim() === '') {
    return c.json({ error: 'description is required — explain what this patch does so models can understand it' }, 400)
  }
  if (!graph || typeof graph !== 'object') {
    return c.json({ error: 'graph is required' }, 400)
  }

  // Validate before storing
  const validationErrors = validateGraph(graph as any, nodeSpec)
  if (validationErrors.length > 0) {
    return c.json({ error: 'Graph validation failed — patch not stored.', validation_errors: validationErrors }, 422)
  }

  const record = { alias, description: description.trim(), graph, created_at: new Date().toISOString() }
  writeFileSync(resolve(PATCHES_DIR, `${alias}.json`), JSON.stringify(record, null, 2))
  logRun({ type: 'patch_save', alias })
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

app.delete('/patch/:alias', (c) => {
  const alias = c.req.param('alias')
  const filePath = resolve(PATCHES_DIR, `${alias}.json`)
  if (!existsSync(filePath)) {
    return c.json({ error: `Patch "${alias}" not found.` }, 404)
  }
  unlinkSync(filePath)
  logRun({ type: 'patch_delete', alias })
  return c.json({ ok: true, alias })
})

app.get('/patches', (c) => {
  const files = existsSync(PATCHES_DIR)
    ? readdirSync(PATCHES_DIR).filter(f => f.endsWith('.json'))
    : []
  const list = files.map(f => {
    try {
      const record = JSON.parse(readFileSync(resolve(PATCHES_DIR, f), 'utf8'))
      const node_types: string[] = [...new Set<string>(
        (record.graph?.nodes ?? []).map((n: { type: string }) => n.type)
      )]
      return {
        alias: record.alias,
        description: record.description,
        node_types,
        node_count: record.graph?.nodes?.length ?? 0,
        created_at: record.created_at,
      }
    } catch { return null }
  }).filter(Boolean)
  return c.json(list)
})

// ---------------------------------------------------------------------------
// GET /logs?limit=N — recent run log entries (default 50, max 500)
// ---------------------------------------------------------------------------
app.get('/logs', (c) => {
  const limitParam = parseInt(c.req.query('limit') ?? '50', 10)
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 500)

  if (!existsSync(LOG_FILE)) {
    return c.json([])
  }

  const lines = readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim() !== '')

  const entries = lines
    .slice(-limit)
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)
    .reverse()

  return c.json(entries)
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

export default { port: 3001, hostname: '0.0.0.0', fetch: app.fetch }
