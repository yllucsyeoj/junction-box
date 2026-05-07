import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { toposort } from './toposort'
import type { NodeSpec } from './spec'

const ROOT = resolve(import.meta.dir, '..')

function buildUseLines(): string {
  const primDir = resolve(ROOT, 'primitives')
  const primFiles = existsSync(primDir)
    ? (readdirSync(primDir, { recursive: true }) as string[])
        .filter(f => f.endsWith('.nu'))
        .map(f => `use primitives/${f} *`)
    : ['use primitives.nu *']  // fallback if directory doesn't exist yet
  const extDir = resolve(ROOT, 'extensions')
  const extFiles = existsSync(extDir)
    ? readdirSync(extDir).filter(f => f.endsWith('.nu')).map(f => `use extensions/${f} *`)
    : []
  return [...primFiles, ...extFiles].join('; ')
}

interface GraphNode { id: string; type: string; params: Record<string, unknown> }
interface GraphEdge { id: string; from: string; from_port: string; to: string; to_port: string }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export type SSEEvent =
  | { node_id: string; status: 'running' }
  | { node_id: string; status: 'done'; output: string }
  | { node_id: string; status: 'error'; error: string; error_type: string; expected_type?: string; got_type?: string }
  | { node_id: string; status: 'skipped'; reason: string }
  | { status: 'complete' }

export interface NodeRunRecord {
  node_id: string
  type: string
  status: 'done' | 'error' | 'skipped'
  duration_ms: number
  error?: string
  error_type?: string
}

// Extract actual type from Nu pipeline_mismatch error text.
// Nu errors include lines like: "expected table<...>, found record"
function extractGotType(raw: string): string | undefined {
  const m = raw.match(/found\s+([\w<>, ]+?)(?:\s*[\n,.]|$)/i)
  if (m) return m[1].trim().split('<')[0]  // normalize list<any> → list
  return undefined
}

// Per-node error hints keyed by nodeType.error_type
const NODE_ERROR_HINTS: Record<string, Record<string, string>> = {
  merge: {
    type_mismatch: 'merge expects record input — did you wire an int or table? Use col_stats or summarize instead for aggregate data.',
  },
  summarize: {
    invalid_param_value: 'summarize only accepts one operation per call — choose avg, sum, min, max, or count. Chain multiple summarize nodes for multiple aggregations.',
  },
  filter: {
    type_mismatch: 'filter column must match the comparison value type. For date/datetime columns, use ISO format strings (e.g. "2026-01-29").',
  },
  map: {
    syntax: 'map --value expects NUON format (e.g. {col: "new_value"} or 42). If wiring a string value, it will be auto-unwrapped.',
  },
  update: {
    syntax: 'update --value expects NUON format. If wiring a string value, it will be auto-unwrapped.',
  },
}

// Extract the innermost meaningful error message from a nested Nu error.
// Nu errors are often wrapped multiple times (e.g. each -> subprocess -> actual error).
function extractCoreMessage(raw: string): string {
  // Look for the deepest "x <message>" line — the actual human-readable error
  const lines = raw.split('\n')
  let best = ''
  for (const line of lines) {
    const m = line.match(/^\s*x\s+(.+)$/)
    if (m) {
      const msg = m[1].trim()
      // Prefer deeper/more specific messages over generic wrappers
      if (msg.length > best.length && !msg.includes('Eval block failed') && !msg.includes('each expression failed')) {
        best = msg
      }
    }
  }
  // Fallback: if no "x " lines found, clean up the raw string
  if (!best) {
    best = raw
      .replace(/Error:\s*nu::[a-z_:]+/g, '')
      .replace(/\s*,?-\[.*?:\d+:\d+\][\s\S]*?`----/g, '')
      .replace(/\n+/g, ' ')
      .trim()
  }
  return best || raw.trim()
}

// Strip internal file/line references from Nu error output and return a clean message.
function normalizeNuError(
  raw: string,
  nodeType: string,
  params: Record<string, unknown>,
  expectedType?: string
): { message: string; error_type: string; expected_type?: string; got_type?: string } {
  const core = extractCoreMessage(raw)

  // Classify error type from Nu message patterns
  let error_type = 'runtime'
  if (raw.includes('pipeline_mismatch') || raw.includes('cant_convert') || raw.includes('type_mismatch') || raw.includes('only string input data')) {
    error_type = 'type_mismatch'
  } else if (raw.includes('column_not_found') || raw.includes('CantFindColumn') || raw.includes('cannot find column') || raw.includes('Cannot find column')) {
    error_type = 'missing_column'
  } else if (raw.includes('expected_keyword') || raw.includes('parser') || raw.includes('error when loading nuon text')) {
    error_type = 'syntax'
  } else if (raw.includes('NotFound') || raw.includes('not found')) {
    error_type = 'not_found'
  } else if (raw.includes('Network failure') || raw.includes('os error 111') || raw.includes('Connection refused') || raw.includes('unable to connect')) {
    error_type = 'network_error'
  } else if (raw.includes('Division by zero') || raw.includes('division_by_zero')) {
    error_type = 'arithmetic'
  }

  // Extract got_type for type_mismatch errors
  const got_type = (error_type === 'type_mismatch') ? extractGotType(raw) : undefined

  // Try to add a hint about which param might be wrong based on the message
  const paramHints: string[] = []
  const paramsObj = params ?? {}
  for (const [k, v] of Object.entries(paramsObj)) {
    if (core.toLowerCase().includes(String(v).toLowerCase().slice(0, 6))) {
      paramHints.push(k)
    }
  }
  const paramHint = paramHints.length > 0 ? ` (check param: ${paramHints.join(', ')})` : ''

  // Look up per-node error hint
  const nodeHint = NODE_ERROR_HINTS[nodeType]?.[error_type] ?? ''

  // Build improved message with all available context
  let message = core
  if (got_type) message += ` (got: ${got_type})`
  if (expectedType && expectedType !== 'any') message += ` (expected: ${expectedType})`
  if (nodeHint) message += ` — ${nodeHint}`
  if (paramHint) message += paramHint

  const result: { message: string; error_type: string; expected_type?: string; got_type?: string } = {
    message,
    error_type,
  }
  if (expectedType && expectedType !== 'any') result.expected_type = expectedType
  if (got_type) result.got_type = got_type
  return result
}

export async function runPipeline(
  graph: Graph,
  emit: (event: SSEEvent) => void,
  specs: NodeSpec[] = []
): Promise<NodeRunRecord[]> {
  const specMap = new Map(specs.map(s => [s.name, s]))
  // Validate and determine execution order
  const order = toposort(
    graph.nodes.map(n => n.id),
    graph.edges.map(e => ({ from: e.from, to: e.to }))
  )

  const outputs = new Map<string, string>()   // node_id -> NUON string
  const failed = new Set<string>()            // nodes that errored or were skipped
  const errors = new Map<string, { error: string; error_type: string; expected_type?: string; got_type?: string }>()
  const nodeRecords: NodeRunRecord[] = []

  for (const nodeId of order) {
    const node = graph.nodes.find(n => n.id === nodeId)!
    const nodeStart = Date.now()

    // Skip orphaned source nodes — source nodes (input_type: nothing) with no outgoing edges
    // have nowhere to send their output; running them wastes external API quota.
    const nodeSpecEntry = specMap.get(node.type)
    const isSource = nodeSpecEntry?.input_type === 'nothing'
    const hasOutgoing = graph.edges.some(e => e.from === nodeId)
    if (isSource && !hasOutgoing) {
      emit({ node_id: nodeId, status: 'skipped', reason: `Orphaned source node — no outgoing edges, output would be discarded.` })
      outputs.set(nodeId, 'null')
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'skipped', duration_ms: Date.now() - nodeStart })
      continue
    }

    // If any upstream dependency failed, skip this node rather than running it with null input
    const inputEdge = graph.edges.find(e => e.to === nodeId && e.to_port === 'input')
    const upstreamFailed = inputEdge ? failed.has(inputEdge.from) : false
    if (upstreamFailed && node.type !== 'catch') {
      emit({ node_id: nodeId, status: 'skipped', reason: `Upstream node "${inputEdge.from}" failed or was skipped.` })
      failed.add(nodeId)
      outputs.set(nodeId, 'null')
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'skipped', duration_ms: Date.now() - nodeStart })
      continue
    }

    emit({ node_id: nodeId, status: 'running' })

    // inputEdge already found above for skipping logic — reuse it here
    const pipelineInput = inputEdge ? (outputs.get(inputEdge.from) ?? null) : null

    // If this is a catch node and upstream failed, pass the upstream error via env var
    // so prim-catch can invoke the handler instead of skipping entirely
    const upstreamError = upstreamFailed ? errors.get(inputEdge!.from) : undefined

    // Resolve params — edge-connected params come from env vars.
    // Collect all param names: both statically set AND wired-only (absent from node.params).
    const paramEnv: Record<string, string> = {}
    const resolvedFlags: string[] = []

    const wiredPorts = new Set(
      graph.edges
        .filter(e => e.to === nodeId && e.to_port !== 'input')
        .map(e => e.to_port)
    )
    const allParamNames = new Set([...(node.params ? Object.keys(node.params) : []), ...wiredPorts])

    for (const paramName of allParamNames) {
      // Sanitize paramName before embedding in Nu script — defense-in-depth
      if (!/^[a-z][a-z0-9_-]*$/.test(paramName)) continue
      const paramValue = (node.params ?? {})[paramName] ?? ''
      const paramEdges = graph.edges.filter(e => e.to === nodeId && e.to_port === paramName)
      if (paramEdges.length > 0) {
        const envKey = `GONUDE_PARAM_${paramName.toUpperCase()}`
        if (paramEdges.length === 1) {
          paramEnv[envKey] = outputs.get(paramEdges[0].from) ?? 'null'
        } else {
          const values = paramEdges.map(e => outputs.get(e.from) ?? 'null')
          paramEnv[envKey] = JSON.stringify(values)
        }
        resolvedFlags.push(`--${paramName} $env.${envKey}`)
      } else {
        // Escape string value for Nu — wrap in quotes, escape inner quotes
        const escaped = String(paramValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        resolvedFlags.push(`--${paramName} "${escaped}"`)
      }
    }

    // Build Nu invocation
    const flagStr = resolvedFlags.join(' ')
    // Allowlist node.type before embedding in Nu script — defense-in-depth
    if (!/^[a-z][a-z0-9_-]*$/.test(node.type)) {
      const errMsg = `Invalid node type "${node.type}" — must match [a-z][a-z0-9_-]*`
      emit({ node_id: nodeId, status: 'error', error: errMsg, error_type: 'runtime' })
      failed.add(nodeId)
      outputs.set(nodeId, 'null')
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'error', duration_ms: Date.now() - nodeStart, error: errMsg, error_type: 'runtime' })
      continue
    }
    const cmdName = `prim-${node.type}`
    // Pass pipeline input via env var — to json produces multi-line output which
    // would break Nu string-literal embedding; env vars handle arbitrary content safely.
    const PIPE_IN = 'GONUDE_PIPE_IN'
    if (pipelineInput !== null) paramEnv[PIPE_IN] = pipelineInput
    if (node.type === 'catch' && upstreamError) {
      paramEnv['GONUDE_UPSTREAM_ERROR'] = JSON.stringify(upstreamError)
    }
    const inputExpr = pipelineInput !== null ? `($env.${PIPE_IN} | from json) | ` : ''
    // All nodes serialize to JSON — clean for API consumers and jq-able directly.
    const serialize = '| to json'
    // Use $e.json to capture the full nested error structure, not just the outer $e.msg
    const nuScript = `${buildUseLines()}; try { ${inputExpr}${cmdName} ${flagStr} ${serialize} } catch {|e| $"__GONUDE_ERROR:($e.json)" | to json }`

    const proc = Bun.spawnSync(
      ['nu', '-c', nuScript],
      {
        cwd: ROOT,
        env: { ...process.env, ...paramEnv } as Record<string, string>,
        stderr: 'pipe',
      }
    )

    const stdout = Buffer.from(proc.stdout).toString().trim()
    const stderr = Buffer.from(proc.stderr).toString().trim()

    const nodeSpec = specMap.get(node.type)
    // input_type is what this node expects to receive — used to annotate type mismatch errors
    const expectedType = nodeSpec?.input_type

    if (proc.exitCode !== 0) {
      // Parse/syntax error — Nu couldn't compile the script
      const { message, error_type, expected_type, got_type } = normalizeNuError(stderr, node.type, node.params, expectedType)
      const errInfo = { error: message, error_type, expected_type, got_type }
      errors.set(nodeId, errInfo)
      emit({ node_id: nodeId, status: 'error', error: message, error_type, expected_type, got_type })
      outputs.set(nodeId, 'null')
      failed.add(nodeId)
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'error', duration_ms: Date.now() - nodeStart, error: message, error_type })
    } else if (stdout.startsWith('"__GONUDE_ERROR:')) {
      // Runtime error caught by try/catch wrapper
      // $e.json is a JSON string inside a JSON string, so parse twice
      let raw: string
      try {
        const outer = JSON.parse(stdout).slice('__GONUDE_ERROR:'.length)
        const errObj = JSON.parse(outer)
        // Recursively find the deepest inner error message
        let inner = errObj
        while (inner.inner && inner.inner.length > 0) {
          inner = inner.inner[0]
        }
        raw = inner.msg || errObj.msg || outer
      } catch {
        raw = JSON.parse(stdout).slice('__GONUDE_ERROR:'.length)
      }
      const { message, error_type, expected_type, got_type } = normalizeNuError(raw, node.type, node.params, expectedType)
      const errInfo = { error: message, error_type, expected_type, got_type }
      errors.set(nodeId, errInfo)
      emit({ node_id: nodeId, status: 'error', error: message, error_type, expected_type, got_type })
      outputs.set(nodeId, 'null')
      failed.add(nodeId)
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'error', duration_ms: Date.now() - nodeStart, error: message, error_type })
    } else {
      outputs.set(nodeId, stdout)
      emit({ node_id: nodeId, status: 'done', output: stdout })
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'done', duration_ms: Date.now() - nodeStart })
    }
  }

  emit({ status: 'complete' })
  return nodeRecords
}
