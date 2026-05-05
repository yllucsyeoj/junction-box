import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { resolve } from 'node:path'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { upsertPatch, getPatch, listPatches, deletePatch, getRun, getResponse, listRuns, extractRequiredParams } from './db'
import { loadSpec } from './spec'
import { type NodeRunRecord } from './execute'
import { validateGraph } from './validate'
import { executeGraph } from './exec-runner'
import { insertRun, updateRunStatus, insertResponse } from './db'
import { EXAMPLES } from './examples'
import { graphToMermaid } from './mermaid'
import { renderMermaidASCII } from 'beautiful-mermaid'

const app = new Hono()
app.use('/*', cors())

const ROOT = resolve(import.meta.dir, '..')
const DATA_DIR = process.env.GONUDE_DATA_DIR ? resolve(process.env.GONUDE_DATA_DIR) : resolve(ROOT, 'data')
const LOG_FILE = resolve(DATA_DIR, 'runs.jsonl')
const SERVER_START = Date.now()

function makeRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// Ensure data directory exists (important for fresh Docker volumes)
mkdirSync(DATA_DIR, { recursive: true })

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
// Utility: inject runtime params into a graph's const nodes.
// Any const node whose value matches "__param__:fieldname" will have its
// value replaced with the corresponding runtime param value.
//
// Example:
//   Patch has: {id: "t", type: "const", params: {value: "__param__:ticker"}}
//   Call with: POST /exec {alias: "...", params: {ticker: "MSFT"}}
//   Result:    node value becomes "MSFT"
// ---------------------------------------------------------------------------
interface GraphForInject {
  nodes: Array<{ id: string; type: string; params: Record<string, unknown> }>
  edges: unknown[]
}

function injectParams(graph: GraphForInject, params: Record<string, unknown>): GraphForInject {
  const nodes = graph.nodes.map(node => {
    if (node.type !== 'const') return node
    const val = node.params.value
    if (typeof val !== 'string') return node
    const match = val.match(/^__param__:(.+)$/)
    if (!match) return node
    const key = match[1]
    if (!(key in params)) return node
    // Wrap string values in NUON quotes; other types pass through as-is
    const raw = params[key]
    const nuonValue = typeof raw === 'string' ? `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : String(raw)
    return { ...node, params: { ...node.params, value: nuonValue } }
  })
  return { ...graph, nodes }
}

function detectMissingParams(graph: GraphForInject): string[] {
  const missing: string[] = []
  for (const node of graph.nodes) {
    if (node.type !== 'const') continue
    const val = node.params.value
    if (typeof val === 'string') {
      const m = val.match(/^__param__:(.+)$/)
      if (m) missing.push(m[1])
    }
  }
  return missing
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
    step_1: { action: 'GET /catalog', purpose: `Browse all ${nodeSpec.filter(s => s.category !== 'example').length} node types by name, category, hint, and wirable_params — token-efficient. Filter with ?category=transform` },
    step_2: { action: 'GET /defs/:type', purpose: 'Get full schema + example for a specific node type' },
    step_3: { action: 'GET /patterns', purpose: 'Copy pre-built common pipeline patterns' },
    step_4: { action: 'POST /exec with {nodes, edges}', purpose: 'Run a pipeline, get {result} back. Add ?outputs=full for per-node debug outputs.' },
    step_5: { action: 'POST /patch to save', purpose: 'Store a working graph for reuse' },
  },

  // ── Persistence ─────────────────────────────────────────────────────────
  persistence: {
    description: 'All patches, runs, and responses are stored in SQLite for later retrieval.',
    storage: 'Patches, runs, and API responses are persisted in /app/data/junction-box.db',
    reference_mode: {
      description: 'Execute pipelines asynchronously and retrieve results later',
      usage: 'POST /exec with header X-Reference: true → returns {status: "pending", run_id: "..."} immediately',
      retrieval: 'GET /runs/:run_id → result at .result (top-level) and .response.result (full object)',
      example: {
        step_1: { action: 'POST /exec with X-Reference: true', body: '{nodes: [...], edges: [...]}' },
        step_1_result: 'Returns {status: "pending", run_id: "mok4vwll-tv031"}',
        step_2: { action: 'GET /runs/:run_id', purpose: 'Fetch the result later' },
      },
    },
    patches: {
      description: 'Named graphs stored in SQLite, retrieved by alias',
      endpoints: ['POST /patch', 'GET /patches', 'GET /patch/:alias', 'DELETE /patch/:alias'],
      parameterized_patches: {
        description: 'Patches can accept runtime inputs — build truly reusable pipeline functions',
        how_to_define: 'In your patch, use a const node with value "__param__:fieldname" as a placeholder',
        how_to_call: 'POST /exec {"alias": "my-patch", "params": {"fieldname": "value"}}',
        save_format: 'POST /patch body: {alias, description, graph: {nodes: [...], edges: [...]}}  ← note: nodes/edges go inside "graph", not at top level',
        example: {
          save: 'POST /patch {"alias": "get-stock", "description": "Fetch stock price", "graph": {"nodes": [{"id": "t", "type": "const", "params": {"value": "__param__:ticker"}}, ...], "edges": [...]}}',
          call: 'POST /exec {"alias": "get-stock", "params": {"ticker": "MSFT"}}',
          result: 'The const node value becomes "MSFT" at runtime',
          missing_params: 'Calling without params returns 422: {fatal: "Patch requires params: ticker"}',
        },
      },
    },
    runs: {
      description: 'All exec executions are recorded with full response data',
      endpoints: ['GET /runs', 'GET /runs/:run_id'],
      query_params: '?patch_alias=X&limit=50&offset=0',
      use_cases: [
        'Retrieve a previous result without re-running the pipeline',
        'List all runs for a specific patch',
        'Audit trail of all pipeline executions',
      ],
    },
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
    pre_exec_checklist: [
      'Every edge has both from_port and to_port set explicitly — omitting either causes a validation error',
      'Node types are exact — use GET /catalog to confirm the name (e.g. "select" not "select-columns")',
      'filter.op is one of: ==, !=, >, <, contains — not "eq" or "equals"',
      'Source nodes (input_type: nothing) have no incoming edge; every other node must have one',
      'Parameterized patches: always pass all __param__ keys in "params" or you get a 422',
    ],
  },

  // ── Node Categories ────────────────────────────────────────────────────────
  categories: {
    // Core processing
    input:     { description: 'Produce data: const (fixed value), fetch (HTTP GET, URL wirable), env, file-in', color: '#f97316' },
    transform: { description: 'Filter rows, sort, select columns, extract fields, map, reduce, join tables, group, window', color: '#3b82f6' },
    compute:   { description: 'Math, string ops, type conversion, encoding/decoding, hashing, each (list transform)', color: '#eab308' },
    datetime:  { description: 'Current time, format dates, parse dates, timezone conversion', color: '#06b6d4' },
    logic:     { description: 'Conditionals (if), loops (for/while), error handling (try/catch), pattern matching', color: '#ec4899' },
    output:    { description: 'Return (pipeline result), display (debug), to-json/csv/text (serialize)', color: '#22c55e' },
    file:      { description: 'ls, glob, mkdir, rm, path-join, path-parse', color: '#f97316' },
    external:  { description: 'HTTP POST/PUT/DELETE/PATCH, LLM calls, analyze', color: '#a855f7' },
    // Data sources — use GET /catalog?category=<name> to browse each group
    hn:        { description: 'Hacker News: hn-search (stories, query required), hn-comments (comment text, query required)', color: '#f97316' },
    reddit:    { description: 'Reddit: reddit-subreddit, reddit-search (query required), reddit-comments', color: '#ff4500' },
    wikipedia: { description: 'Wikipedia: wiki-search (query required), wiki-summary, wiki-sections, wiki-section, wiki-table', color: '#6b7280' },
    youtube:   { description: 'YouTube: youtube-search, youtube-video, youtube-channel, youtube-playlist, youtube-transcript', color: '#ff0000' },
    github:    { description: 'GitHub: github-repo, github-commits, github-contributors', color: '#24292e' },
    rss:       { description: 'RSS: rss-feed — fetch any RSS/Atom feed as a table', color: '#f97316' },
    web:       { description: 'Web: web-htmd — fetch a URL and convert HTML to Markdown', color: '#3b82f6' },
    market:    { description: 'Market data: market-snapshot, market-history, market-screener, market-options, market-symbols', color: '#22c55e' },
    coingecko: { description: 'Crypto: coingecko-simple (prices), coingecko-markets, coingecko-global', color: '#8dc647' },
    feargreed: { description: 'Sentiment: fear-greed-now, fear-greed-history', color: '#ec4899' },
    sec:       { description: 'SEC filings: sec-10k, sec-10q, sec-8k, sec-earnings, sec-filing, sec-insider, sec-proxy', color: '#003087' },
    fred:      { description: 'FRED economic data: fred-series (time series), fred-search', color: '#1a4480' },
    bls:       { description: 'Bureau of Labor Statistics: bls-series, bls-presets', color: '#1a4480' },
    template:  { description: 'Example/template nodes — reference for building custom data source nodes', color: '#f59e0b' },
  },

  // ── API Endpoints ─────────────────────────────────────────────────────────
  endpoints: {
    'GET /': 'This manifest — comprehensive guide for LLMs',
    'GET /health': 'Server status, uptime, primitive count',
    'GET /catalog': `Token-efficient node index (${nodeSpec.filter(s => s.category !== 'example').length} nodes) — name, category, types, hint, wirable_params. Supports ?category= filter. Start here.`,
    'GET /catalog?category=X': 'Filter catalog by category. Core: input, transform, compute, datetime, logic, output, file, external. Data sources: hn, reddit, wikipedia, youtube, github, rss, web, market, coingecko, feargreed, sec, fred, bls, template.',
    'GET /defs': `All node types — WARNING: large. Use GET /defs/:type for a single node instead.`,
    'GET /defs/:type': 'Full schema + example for a single node type — use after /catalog to get details. Returns name, type (same value), params, ports, wirable_params, example.',
    'GET /patterns': 'Pre-built common pipeline patterns ready to copy/use',
    'POST /exec': 'Run a pipeline → {status, result, errors}. Body: {nodes, edges} for a new graph, OR {alias: "name"} to run a saved patch, OR {alias: "name", params: {key: "val"}} to run a patch with runtime param injection. Add X-Reference: true header for async mode. Add ?outputs=full for per-node debug outputs.',
    'POST /exec (reference mode)': 'Add header X-Reference: true → returns {status: "pending", run_id: "..."} immediately. Execute GET /runs/:run_id later to fetch result.',
    'POST /patch': 'Save a validated graph: {alias, description, graph}',
    'GET /patches': 'List all saved patches (stored in SQLite)',
    'GET /patch/:alias': 'Get a saved patch by alias',
    'DELETE /patch/:alias': 'Delete a saved patch',
    'GET /visualise/:alias': 'Render a saved patch as an ASCII flowchart diagram — useful for visualizing dataflow pipelines before running',
    'GET /runs': 'List all runs with optional filters: ?patch_alias=X&limit=50&offset=0 (all runs stored in SQLite)',
    'GET /runs/:run_id': 'Fetch a specific run by ID — includes full graph, status, and stored response',
    'GET /logs': 'Recent execution log (JSONL file)',
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
      issue: 'position field in nodes is optional — omit it',
      solution: 'Examples in /defs show position: {x, y} on every node, but position is ignored during execution. Omit it to save tokens.',
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
    {
      issue: 'Reading /exec responses — no post-processing needed',
      solution: 'The API returns plain JSON. Read the raw curl stdout directly — do not pipe through python, jq, or any parser. Example: curl -s -X POST .../exec -H "Content-Type: application/json" -d @graph.json — then read the output as-is. Piping through python3 -m json.tool breaks on control characters in strings.',
    },
    {
      issue: 'Need to retrieve a previous result without re-running',
      solution: 'Use reference mode: POST /exec with X-Reference: true header → returns run_id immediately. Then GET /runs/:run_id to fetch the stored result at any time. All runs are persisted in SQLite.',
    },
    {
      issue: 'if node does not create true branches — fallback flows into downstream nodes',
      solution: 'The if node substitutes the fallback value when false, but downstream nodes still run on both branches. Use it only for value substitution, not for routing to different processing paths.',
    },
    {
      issue: 'table-concat with mismatched column names creates sparse rows silently',
      solution: 'If left table has "points" and right has "score", merged rows will have one column null. Rename columns to match before merging. Use the rename node upstream.',
    },
    {
      issue: 'GET /runs/:run_id — accessing the result',
      solution: 'Result is at .result (top-level shortcut) AND .response.result (full exec object). Use .result for the plain value; use .response for validation_errors, warnings, errors, etc.',
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
  primitives: nodeSpec.filter(s => s.category !== 'example').length,
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
  const rawFilter = c.req.query('category')
  const categoryFilter = rawFilter?.toLowerCase()
  const validCategories = [...new Set(nodeSpec.filter(s => s.category !== 'example').map(s => s.category))]

  if (categoryFilter && !validCategories.includes(categoryFilter)) {
    return c.json({
      nodes: [],
      hint: `Unknown category "${rawFilter}". Valid categories: ${validCategories.sort().join(', ')}.`,
    }, 400)
  }

  const catalog = nodeSpec
    .filter(s => s.category !== 'example')  // template artifacts, not real nodes
    .filter(s => !categoryFilter || s.category === categoryFilter)
    .map(s => ({
      name: s.name,
      category: s.category,
      input_type: s.input_type,
      output_type: s.output_type,
      agent_hint: s.agent_hint,
      wirable_params: s.params.filter(p => p.wirable).map(p => p.name),
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
  const { errors: runValidationErrors } = validateGraph(graph as any, nodeSpec)
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
  if (!spec) return c.json({ status: 'error', error: `Unknown node type: "${typeName}"` }, 404)
  const example = EXAMPLES[typeName] ?? null
  // Extract wirable params into a separate field with type info and descriptions
  const wirableParams = spec.ports.inputs
    .filter(p => p.name !== 'input')
    .map(p => {
      const paramSpec = spec.params.find(sp => sp.name === p.name)
      return {
        name: p.name,
        type: p.type,
        description: paramSpec?.description ?? '',
      }
    })
  return c.json({ ...spec, type: spec.name, example, wirable_params: wirableParams })
})

app.get('/defs', (c) => {
  const full = nodeSpec.map(s => ({
    ...s,
    type: s.name,
    example: EXAMPLES[s.name] ?? null,
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
//   { status: "complete", outputs: { nodeId: value }, result: <parsed JSON value> | null }
//   { status: "error", validation_errors: [...], errors: {...}, skipped: [...], fatal, result: null }
//
// The "result" field contains the parsed JSON output of the first "return" node, or the
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
  const outputsMode = c.req.query('outputs') ?? 'none'  // 'none' (default) | 'full'
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
    // Support alias shorthand: {"alias": "my-patch"} or {"alias": "...", "params": {...}}
    if (body && typeof body === 'object' && 'alias' in body) {
      alias = String((body as any).alias)
      const patch = getPatch(alias)
      if (!patch) {
        logRun({ type: 'exec', run_id, alias, status: 'error', fatal: 'patch_not_found', duration_ms: Date.now() - t0 })
        return c.json({ status: 'error', run_id, fatal: `Patch alias "${alias}" not found. Use GET /patches to list available patches.`, errors: {}, validation_errors: [], skipped: [], outputs: {}, result: null }, 404)
      }
      // Apply runtime params: inject into const nodes whose value matches __param__:fieldname
      const runtimeParams = (body as any).params
      if (runtimeParams && typeof runtimeParams === 'object') {
        graph = injectParams(patch.graph as any, runtimeParams)
      } else {
        graph = patch.graph
      }
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

  // Ensure graph has the expected shape before passing to validator
  if (!graph || typeof graph !== 'object' || !Array.isArray((graph as any).nodes)) {
    logRun({ type: 'exec', run_id, alias, status: 'error', fatal: 'bad_graph_shape', duration_ms: Date.now() - t0 })
    return c.json({
      status: 'error', run_id,
      fatal: 'Request body must be a graph object: {nodes: [...], edges: [...]}.',
      validation_errors: [], errors: {}, skipped: [], outputs: {}, result: null,
    }, 400)
  }

  // Default edges to [] — a single const node with no edges is a valid (if trivial) pipeline
  if (!Array.isArray((graph as any).edges)) {
    (graph as any).edges = []
  }

  // Empty graph — nothing to execute
  if ((graph as any).nodes.length === 0) {
    return c.json({
      status: 'error', run_id,
      fatal: 'Graph has no nodes. Add at least one node to execute.',
      validation_errors: [], errors: {}, skipped: [], outputs: {}, result: null,
    }, 400)
  }

  // Detect unresolved __param__ placeholders — prevents silent literal-string queries
  const missingParams = detectMissingParams(graph as GraphForInject)
  if (missingParams.length > 0) {
    return c.json({
      status: 'error', run_id,
      fatal: `${alias ? `Patch "${alias}"` : 'Graph'} requires params: ${missingParams.join(', ')}. Pass them as {"alias": "...", "params": {"${missingParams[0]}": "value"}}.`,
      validation_errors: [], errors: {}, skipped: [], outputs: {}, result: null,
    }, 422)
  }

  const referenceMode = c.req.header('x-reference') === 'true' || c.req.query('reference') === 'true'

  if (referenceMode) {
    try {
      insertRun(run_id, alias, graph, null, 'pending')
    } catch (err) {
      return c.json({ status: 'error', run_id, fatal: 'Failed to create run record' }, 500)
    }

    const execGraph = graph as any
    const execAlias = alias
    const execRunId = run_id
    const execOutputsMode = outputsMode

    ;(async () => {
      const execT0 = Date.now()
      try {
        const result = await executeGraph(execGraph, nodeSpec, execRunId, execOutputsMode as any)
        updateRunStatus(execRunId, result.status)
        const { nodeRecords: _nr, ...storedResult } = result
        insertResponse(execRunId, storedResult)
        logRun({ type: 'exec', run_id: execRunId, alias: execAlias, status: result.status, node_count: execGraph.nodes?.length ?? 0, duration_ms: Date.now() - execT0 }, result.nodeRecords)
      } catch (err) {
        updateRunStatus(execRunId, 'error')
        logRun({ type: 'exec', run_id: execRunId, alias: execAlias, status: 'error', fatal: String(err), duration_ms: Date.now() - execT0 })
      }
    })()

    return c.json({ status: 'pending', run_id })
  }

  const execResult = await executeGraph(graph as any, nodeSpec, run_id, outputsMode as any)
  const { nodeRecords, ...resp } = execResult

  try {
    insertRun(run_id, alias, graph, null, resp.status)
    insertResponse(run_id, resp)
  } catch (err) {
    console.error('Failed to store run/response:', err)
  }

  logRun({ type: 'exec', run_id, alias, status: resp.status, node_count: (graph as any)?.nodes?.length ?? 0, duration_ms: Date.now() - t0 }, nodeRecords)

  // Use correct HTTP status: validation/runtime graph errors are client errors, not server errors
  const hasRuntimeErrors = resp.errors && Object.keys(resp.errors).length > 0
  const httpStatus = resp.validation_errors?.length > 0 ? 422
    : hasRuntimeErrors ? 422
    : resp.fatal ? 400
    : 200
  return c.json(resp, httpStatus)
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
  const { errors: validationErrors } = validateGraph(graph as any, nodeSpec)
  if (validationErrors.length > 0) {
    return c.json({ error: 'Graph validation failed — patch not stored.', validation_errors: validationErrors }, 422)
  }

  const updated = upsertPatch(alias, description.trim(), graph)
  logRun({ type: 'patch_save', alias })
  return c.json({
    ok: true,
    alias,
    validated: true,
    updated,
    _manifest: {
      hint: 'Run this patch: POST /exec {alias: "..."}',
      visualise: 'GET /visualise/:alias',
    }
  })
})

app.get('/patch/:alias', (c) => {
  const alias = c.req.param('alias')
  const patch = getPatch(alias)
  if (!patch) {
    return c.json({ status: 'error', error: `Patch "${alias}" not found.` }, 404)
  }
  return c.json({
    alias: patch.alias,
    description: patch.description,
    required_params: extractRequiredParams(patch.graph),
    graph: patch.graph,
    created_at: patch.created_at,
    _manifest: {
      hint: 'Visualize this patch as ASCII diagram: GET /visualise/:alias',
      run_hint: 'Run this patch: POST /exec {alias: "..."}',
    }
  })
})

app.delete('/patch/:alias', (c) => {
  const alias = c.req.param('alias')
  const deleted = deletePatch(alias)
  if (!deleted) {
    return c.json({ status: 'error', error: `Patch "${alias}" not found.` }, 404)
  }
  logRun({ type: 'patch_delete', alias })
  return c.json({ ok: true, alias })
})

app.get('/patches', (c) => {
  const patches = listPatches()
  return c.json({
    patches,
    _manifest: {
      hint: 'Each patch can be visualized with GET /visualise/:alias or run with POST /exec {alias: "name"}',
      fields: ['alias', 'description', 'node_types', 'node_count', 'created_at'],
    }
  })
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
// GET /runs/:run_id — fetch a stored run and its response
// ---------------------------------------------------------------------------
app.get('/runs/:run_id', (c) => {
  const run_id = c.req.param('run_id')
  const run = getRun(run_id)
  if (!run) {
    return c.json({ status: 'error', error: `Run "${run_id}" not found.` }, 404)
  }
  const response = getResponse(run_id)
  return c.json({
    run_id: run.run_id,
    patch_alias: run.patch_alias,
    status: run.status,
    graph: run.graph,
    created_at: run.created_at,
    result: (response?.response as any)?.result ?? null,
    response: response?.response ?? null,
    _manifest: {
      run_again: run.patch_alias ? `POST /exec {"alias": "${run.patch_alias}"}` : 'POST /exec with graph body',
      visualise: run.patch_alias ? `GET /visualise/${run.patch_alias}` : null,
    },
  })
})

// ---------------------------------------------------------------------------
// GET /runs — list runs with optional filters
// ---------------------------------------------------------------------------
app.get('/runs', (c) => {
  const patchAlias = c.req.query('patch_alias') ?? undefined
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 500)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)

  const { runs, total } = listRuns(patchAlias, limit, offset)
  return c.json({
    runs,
    total,
    limit,
    offset,
    _manifest: {
      hint: 'Fetch a specific run with GET /runs/:run_id',
      filters: ['patch_alias', 'limit', 'offset'],
    }
  })
})

// ---------------------------------------------------------------------------
// POST /parse-nuon — convert NUON to JSON (used by frontend drag-to-load)
// ---------------------------------------------------------------------------
app.post('/parse-nuon', async (c) => {
  // Accept both raw NUON text (Content-Type: text/plain) and
  // JSON body with a "text" field (Content-Type: application/json, body: {text: "..."})
  const contentType = c.req.header('content-type') ?? ''
  let nuonText: string
  if (contentType.includes('application/json')) {
    const body = await c.req.json()
    nuonText = typeof body?.text === 'string' ? body.text : JSON.stringify(body)
  } else {
    nuonText = await c.req.text()
  }
  const parsed = nuonToGraph(nuonText)
  if (!parsed.ok) {
    return c.json({ error: 'Invalid NUON', detail: parsed.error }, 400)
  }
  return c.json(parsed.graph)
})

// ---------------------------------------------------------------------------
// GET /visualise/:alias — render a saved patch as ASCII diagram
// ---------------------------------------------------------------------------
app.get('/visualise/:alias', async (c) => {
  const alias = c.req.param('alias')
  const patch = getPatch(alias)

  if (!patch) {
    return c.json({ error: 'Patch not found', alias }, 404)
  }

  try {
    const mermaid = graphToMermaid(patch.graph)
    const ascii = renderMermaidASCII(mermaid, { useAscii: true })
    return c.text(ascii, 200)
  } catch (err) {
    console.error('visualise error:', err)
    return c.json({ error: 'Failed to render diagram', details: String(err) }, 500)
  }
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
