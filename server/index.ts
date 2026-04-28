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
  const tmpPath = `/tmp/junction-box-parse-${Date.now()}-${Math.random().toString(36).slice(2)}.nuon`
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
// GET / — comprehensive LLM manual
// After ONE call, an LLM should know how to construct any pipeline.
// ---------------------------------------------------------------------------
app.get('/', (c) => c.json({
  name: 'Junction Box Pipeline API',
  version: '1.0',
  description: 'Node-based dataflow engine. Compose nodes into a graph, POST to /exec, get back transformed data. Designed for LLMs to autonomously fetch, filter, transform, and extract data from any source.',

  // ── Quick Start ──────────────────────────────────────────────────────────
  quick_start: {
    step_1: { action: 'GET /catalog', purpose: `Browse all ${nodeSpec.length} node types by name, category, and hint — token-efficient (~15KB). Filter with ?category=transform` },
    step_2: { action: 'GET /defs/:type', purpose: 'Get full schema + example for a specific node type' },
    step_3: { action: 'GET /patterns', purpose: 'Copy pre-built common pipeline patterns' },
    step_4: { action: 'POST /exec with {nodes, edges}', purpose: 'Run a pipeline, get {result} back. Add ?outputs=none for minimal response.' },
    step_5: { action: 'POST /patch to save', purpose: 'Store a working graph for reuse' },
  },

  // ── Core Concept ─────────────────────────────────────────────────────────
  concept: {
    description: 'A pipeline is a directed graph of nodes. Data flows from left to right along edges.',
    anatomy: {
      node: 'A processing step with: id (unique name), type (what it does), params (configuration)',
      edge: 'A connection: from node + from_port → to node + to_port',
      data_flow: 'Leftmost nodes produce data. Rightmost nodes consume it. Every node needs an incoming edge.',
    },
    result_field: 'The output of the "return" node (or the last node if no return) becomes the pipeline result.',
  },

  // ── Graph Format ──────────────────────────────────────────────────────────
  graph_format: {
    example: {
      nodes: [
        { id: 'src', type: 'const', params: { value: '[1, 2, 3]' } },
        { id: 'op', type: 'each', params: { expr: '$in * 2' } },
        { id: 'out', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
        { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
      ],
    },
    rules: [
      'Every node needs a unique id (lowercase, hyphens ok)',
      'Every non-source node needs an incoming edge',
      'Edges connect: from node id + "output" → to node id + "input"',
      'Source nodes (const, fetch, date-now, env) have no incoming edge',
      'Terminal nodes (return) should be the rightmost',
    ],
  },

  // ── Node Categories ────────────────────────────────────────────────────────
  categories: {
    input: { description: 'Produce data: const (fixed value), fetch (HTTP GET), env, file-in', color: '#f97316' },
    transform: { description: 'Filter rows, sort, select columns, extract fields, map, reduce, join tables, group, window', color: '#3b82f6' },
    compute: { description: 'Math, string ops, type conversion, encoding/decoding, hashing, each (list transform)', color: '#eab308' },
    datetime: { description: 'Current time, format dates, parse dates, timezone conversion', color: '#06b6d4' },
    logic: { description: 'Conditionals (if), loops (for/while), error handling (try/catch), pattern matching', color: '#ec4899' },
    output: { description: 'Return (pipeline result), display (debug), to-json/csv/text (serialize)', color: '#22c55e' },
    file: { description: 'ls, glob, mkdir, rm, path-join, path-parse', color: '#f97316' },
    external: { description: 'HTTP POST/PUT/DELETE/PATCH, LLM calls, analyze', color: '#a855f7' },
  },

  // ── API Endpoints ─────────────────────────────────────────────────────────
  endpoints: {
    'GET /': 'This manifest — comprehensive guide for LLMs',
    'GET /health': 'Server status, uptime, primitive count',
    'GET /catalog': `Token-efficient node index (${nodeSpec.length} nodes) — name, category, types, hint only (~15KB). Supports ?category= filter. Start here.`,
    'GET /catalog?category=X': 'Filter catalog by category: input, transform, compute, datetime, logic, output, file, external',
    'GET /defs': `All ${nodeSpec.length} node types with full schemas, params, ports, examples`,
    'GET /defs/:type': 'Full schema + example for a single node type — use after /catalog to get details',
    'GET /patterns': 'Pre-built common pipeline patterns ready to copy/use',
    'GET /nodes': 'Raw node spec (no examples)',
    'POST /exec': 'Run a pipeline → {status, result, errors}. ?outputs=none omits intermediate node outputs for minimal response.',
    'POST /patch': 'Save a validated graph: {alias, description, graph}',
    'GET /patches': 'List saved patches',
    'GET /patch/:alias': 'Get a saved patch',
    'DELETE /patch/:alias': 'Delete a patch',
    'GET /logs': 'Recent execution log',
    'POST /parse-nuon': 'Convert NUON text to JSON graph',
  },

  // ── Critical Gotchas ─────────────────────────────────────────────────────
  gotchas: [
    {
      issue: 'get is single-level only',
      solution: 'For nested keys like data.id, chain: fetch → get "data" → get "id"',
    },
    {
      issue: 'Column names are exact-match, case-sensitive',
      solution: 'Inspect output first (look at the outputs{} of a fetch node run). Use GET /catalog to check node input/output types before connecting.',
    },
    {
      issue: 'get on a list/table by index does NOT work',
      solution: 'Use "first" (returns a 1-row table by default) then "get fieldname" to extract a column as a list. To get a single record, use "row" with index 0.',
    },
    {
      issue: 'Disconnected nodes still execute (with null input)',
      solution: 'Always wire every node. Unconnected nodes run but get null input and error silently.',
    },
    {
      issue: 'return node without incoming edge runs immediately with null',
      solution: 'Wire return last, after all processing nodes.',
    },
    {
      issue: 'NUON vs JSON for table constants',
      solution: 'Table syntax: [[col1 col2]; [val1 val2]]. List: [1, 2, 3]. Record: {key: "val"}. Use double quotes inside NUON.',
    },
    {
      issue: 'filter.value is always a plain string',
      solution: 'Pass "G" not "\"G\"". For numeric comparisons (>, <) pass the number as a string: "50" not 50.',
    },
    {
      issue: 'select/reject columns: use comma-separated',
      solution: 'columns: "name,email,phone" or "name email phone" — both work. Comma is the canonical form.',
    },
    {
      issue: 'filter, sort, select do not support nested field paths',
      solution: 'Columns must be top-level names. To filter on address.city, first use "get" to extract the nested record, then filter on top-level keys. Or use row_apply to promote nested fields.',
    },
  ],

  // ── Value Formats ─────────────────────────────────────────────────────────
  value_formats: {
    nuon_vs_json: 'NUON is Nushell Object Notation - more readable. Use it for params.',
    table_syntax: '[[column1 column2]; [row1val1 row1val2] [row2val1 row2val2]]',
    list_syntax: '[item1, item2, item3] or [1, 2, 3]',
    record_syntax: '{key: "value", num: 42, list: [1, 2]}',
    string_quoting: 'Use double quotes inside NUON: "hello" not \'hello\'. For nested quotes, escape: "He said \\"hi\\""',
  },
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
// GET /catalog — token-efficient node index for agent discovery
//
// Returns only {name, category, input_type, output_type, agent_hint} per node.
// ~15KB vs 111KB for /defs. Use this first to find relevant node types,
// then call GET /defs/:type for the full schema of nodes you want to use.
//
// Optional: ?category=transform (or input, compute, datetime, logic, output, file, external)
// ---------------------------------------------------------------------------
app.get('/catalog', (c) => {
  const categoryFilter = c.req.query('category')
  const catalog = nodeSpec
    .filter(s => !categoryFilter || s.category === categoryFilter)
    .map(s => ({
      name: s.name,
      category: s.category,
      input_type: s.input_type,
      output_type: s.output_type,
      agent_hint: s.agent_hint,
    }))
  return c.json(catalog)
})

// ---------------------------------------------------------------------------
// POST /run — SSE stream for the frontend canvas ONLY
// Accepts: text/event-stream clients (WebUI)
// Returns: text/event-stream
//
// Agents: use POST /exec instead — it returns synchronous JSON.
// ---------------------------------------------------------------------------
app.post('/run', async (c) => {
  // Reject non-SSE clients (agents, curl, etc.) with a helpful pointer to /exec
  const accept = c.req.header('accept') ?? ''
  if (!accept.includes('text/event-stream')) {
    return c.json({
      error: 'POST /run streams Server-Sent Events and is intended for the WebUI frontend. Use POST /exec for synchronous JSON responses.',
      exec_endpoint: 'POST /exec',
      body_format: { nodes: [{ id: 'string', type: 'node-type', params: {} }], edges: [{ id: 'string', from: 'node-id', from_port: 'output', to: 'node-id', to_port: 'input' }] },
      alias_shorthand: { alias: 'my-patch-name' },
      docs: 'GET / for full API guide',
    }, 400)
  }

  const graph = await c.req.json()

  // Validate before executing so the frontend gets a structured error, not a JS crash
  const runValidationErrors = validateGraph(graph as any, nodeSpec)
  const encoder = new TextEncoder()
  if (runValidationErrors.length > 0) {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'fatal', error: 'Graph validation failed', validation_errors: runValidationErrors })}\n\n`))
        controller.close()
      }
    })
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    })
  }

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
// GET /patterns — pre-built common pipeline patterns
// ---------------------------------------------------------------------------
app.get('/patterns', (c) => c.json({
  description: 'Common pipeline patterns. Copy, modify, POST to /exec.',
  patterns: [
    {
      name: 'fetch-filter-sort',
      description: 'GET data, filter rows, sort by column',
      nodes: [
        { id: 'fetch', type: 'fetch', params: { url: 'https://jsonplaceholder.typicode.com/users' } },
        { id: 'filter', type: 'filter', params: { column: 'name', op: 'contains', value: 'a' } },
        { id: 'sort', type: 'sort', params: { column: 'name', direction: 'asc' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'fetch', from_port: 'output', to: 'filter', to_port: 'input' },
        { id: 'e2', from: 'filter', from_port: 'output', to: 'sort', to_port: 'input' },
        { id: 'e3', from: 'sort', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'extract-nested-field',
      description: 'Navigate into nested JSON to extract a specific value',
      nodes: [
        { id: 'fetch', type: 'fetch', params: { url: 'https://jsonplaceholder.typicode.com/users/1' } },
        { id: 'get', type: 'get', params: { key: 'address' } },
        { id: 'get2', type: 'get', params: { key: 'city' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'fetch', from_port: 'output', to: 'get', to_port: 'input' },
        { id: 'e2', from: 'get', from_port: 'output', to: 'get2', to_port: 'input' },
        { id: 'e3', from: 'get2', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'table-join',
      description: 'Join two tables on a shared column (SQL-style inner join)',
      nodes: [
        { id: 'left', type: 'const', params: { value: '[[id name]; [1 alice] [2 bob] [3 carol]]' } },
        { id: 'right', type: 'const', params: { value: '[[id score]; [1 95] [2 87] [4 100]]' } },
        { id: 'join', type: 'join', params: { on: 'id', type: 'inner', right: '[]' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'left', from_port: 'output', to: 'join', to_port: 'input' },
        { id: 'e2', from: 'right', from_port: 'output', to: 'join', to_port: 'right' },
        { id: 'e3', from: 'join', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'group-aggregate',
      description: 'Group rows by column, compute aggregate per group',
      nodes: [
        { id: 'data', type: 'const', params: { value: '[[cat val]; [A 10] [A 30] [B 5] [B 15] [A 20]]' } },
        { id: 'group', type: 'group-by', params: { column: 'cat' } },
        { id: 'agg', type: 'group-agg', params: { column: 'val', op: 'avg' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'data', from_port: 'output', to: 'group', to_port: 'input' },
        { id: 'e2', from: 'group', from_port: 'output', to: 'agg', to_port: 'input' },
        { id: 'e3', from: 'agg', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'transform-list',
      description: 'Apply expression to each element of a list',
      nodes: [
        { id: 'list', type: 'const', params: { value: '[1, 2, 3, 4, 5]' } },
        { id: 'each', type: 'each', params: { expr: '$in * $in' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'list', from_port: 'output', to: 'each', to_port: 'input' },
        { id: 'e2', from: 'each', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'string-interpolation',
      description: 'Insert record fields into a template string',
      nodes: [
        { id: 'record', type: 'const', params: { value: '{name: "Alice", score: 95}' } },
        { id: 'tmpl', type: 'str-interp', params: { template: 'Player {name} scored {score} points!' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'record', from_port: 'output', to: 'tmpl', to_port: 'input' },
        { id: 'e2', from: 'tmpl', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'column-select-rename',
      description: 'Select specific columns, rename one',
      nodes: [
        { id: 'data', type: 'const', params: { value: '[[name age city score]; [alice 30 NYC 95] [bob 25 LA 87] [carol 35 NYC 92]]' } },
        { id: 'select', type: 'select', params: { columns: 'name,score' } },
        { id: 'rename', type: 'rename', params: { from: 'score', to: 'grade' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'data', from_port: 'output', to: 'select', to_port: 'input' },
        { id: 'e2', from: 'select', from_port: 'output', to: 'rename', to_port: 'input' },
        { id: 'e3', from: 'rename', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'rolling-window-aggregate',
      description: 'Compute rolling average over N rows',
      nodes: [
        { id: 'data', type: 'const', params: { value: '[[day price]; [1 100] [2 102] [3 98] [4 105] [5 103] [6 107]]' } },
        { id: 'window', type: 'window', params: { column: 'price', size: '3', op: 'avg', as_col: 'ma3' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'data', from_port: 'output', to: 'window', to_port: 'input' },
        { id: 'e2', from: 'window', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'conditional-fallback',
      description: 'If condition is true return input, else return fallback',
      nodes: [
        { id: 'value', type: 'const', params: { value: '42' } },
        { id: 'check', type: 'if', params: { column: '', op: '>', value: '10', fallback: '0' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'value', from_port: 'output', to: 'check', to_port: 'input' },
        { id: 'e2', from: 'check', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
    {
      name: 'column-statistics',
      description: 'Compute count/sum/avg/min/max for a numeric column',
      nodes: [
        { id: 'data', type: 'const', params: { value: '[[price]; [100] [102] [98] [105] [103]]' } },
        { id: 'stats', type: 'col-stats', params: { column: 'price' } },
        { id: 'return', type: 'return', params: {} },
      ],
      edges: [
        { id: 'e1', from: 'data', from_port: 'output', to: 'stats', to_port: 'input' },
        { id: 'e2', from: 'stats', from_port: 'output', to: 'return', to_port: 'input' },
      ],
    },
  ],
}))

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
  const outputsMode = c.req.query('outputs') ?? 'full'  // 'full' (default) | 'none'
  const run_id = makeRunId()
  const t0 = Date.now()

  let graph: unknown
  let alias: string | null = null

  if (contentType.includes('application/json')) {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      logRun({ type: 'exec', run_id, alias, status: 'error', fatal: 'json_parse_error', duration_ms: Date.now() - t0 })
      return c.json({
        status: 'error', run_id, fatal: 'Request body is not valid JSON.',
        validation_errors: [], errors: {}, skipped: [], outputs: {}, result: null,
      }, 400)
    }
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

  const outputs: Record<string, string> = {}  // raw JSON strings, decoded at response time
  const errors: Record<string, { message: string; error_type: string }> = {}
  const skipped: string[] = []
  let fatalError: string | null = null
  let nodeRecords: NodeRunRecord[] = []

  try {
    nodeRecords = await runPipeline(graph as any, (event: SSEEvent) => {
      if ('node_id' in event) {
        if (event.status === 'done') outputs[event.node_id] = event.output
        if (event.status === 'error') errors[event.node_id] = { message: event.error, error_type: event.error_type, ...(event.expected_type ? { expected_type: event.expected_type } : {}), ...(event.got_type ? { got_type: event.got_type } : {}) }
        if (event.status === 'skipped') skipped.push(event.node_id)
      }
      if ('status' in event && event.status === 'fatal') {
        fatalError = (event as { status: 'fatal'; error: string }).error
      }
    }, nodeSpec)
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err)
  }

  const g = graph as { nodes: Array<{ id: string; type: string }> }
  const nodeCount = g.nodes?.length ?? 0

  if (fatalError || Object.keys(errors).length > 0) {
    const partialOutputs: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(outputs)) {
      try { partialOutputs[k] = JSON.parse(v) } catch { partialOutputs[k] = v }
    }
    logRun({ type: 'exec', run_id, alias, status: 'error', node_count: nodeCount, error_count: Object.keys(errors).length, fatal: fatalError, duration_ms: Date.now() - t0 }, nodeRecords)
    const errResp: Record<string, unknown> = {
      status: 'error', run_id,
      validation_errors: [],
      errors,
      fatal: fatalError,
      skipped: outputsMode !== 'none' ? skipped : [],
      outputs: outputsMode !== 'none' ? partialOutputs : {},
      result: null,
    }
    return c.json(errResp, 500)
  }

  // Decode each node's JSON output string into a real value for the API response.
  // The internal outputs map stays as strings (needed for inter-node passing in execute.ts).
  const decodedOutputs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(outputs)) {
    try { decodedOutputs[k] = JSON.parse(v) } catch { decodedOutputs[k] = v }
  }

  // Find the "result" value: first return node, or last node in execution order.
  const returnNode = g.nodes.find(n => n.type === 'return')
  const rawResult = returnNode
    ? (outputs[returnNode.id] ?? null)
    : (Object.values(outputs).at(-1) ?? null)
  const result = rawResult === null ? null : (() => {
    try { return JSON.parse(rawResult) } catch { return rawResult }
  })()

  logRun({ type: 'exec', run_id, alias, status: 'complete', node_count: nodeCount, duration_ms: Date.now() - t0 }, nodeRecords)
  const resp: Record<string, unknown> = {
    status: 'complete', run_id,
    validation_errors: [],
    errors: {},
    fatal: null,
    skipped: outputsMode !== 'none' ? skipped : [],
    outputs: outputsMode !== 'none' ? decodedOutputs : {},
    result,
  }
  return c.json(resp)
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
  try {
    mkdirSync(PATCHES_DIR, { recursive: true })
    writeFileSync(resolve(PATCHES_DIR, `${alias}.json`), JSON.stringify(record, null, 2))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'Failed to save patch to disk.', detail }, 500)
  }
  logRun({ type: 'patch_save', alias })
  return c.json({ ok: true, alias, validated: true })
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

// ---------------------------------------------------------------------------
// Catch-all 404 — converts any unknown path into a useful pointer to GET /
// Covers all the paths a model might probe: /openapi.json, /docs, /swagger,
// /pipelines, /graphs, /execute, /patches/:alias, /run/:alias, etc.
// ---------------------------------------------------------------------------
app.notFound((c) => c.json({
  error: 'Not found',
  hint: 'Call GET / for the full API guide — it lists all endpoints, the graph format, gotchas, and a quick-start guide.',
  manifest: 'GET /',
  docs: 'GET /defs',
}, 404))

export default { port: 3001, hostname: '0.0.0.0', fetch: app.fetch }
