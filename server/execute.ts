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
    ? (readdirSync(extDir, { recursive: true }) as string[])
        .filter(f => f.endsWith('.nu') && !f.split('/').pop()!.startsWith('_'))
        .map(f => `use extensions/${f} *`)
    : []
  return [...primFiles, ...extFiles].join('; ')
}

interface GraphNode { id: string; type: string; params: Record<string, unknown> }
interface GraphEdge { id: string; from: string; from_port: string; to: string; to_port: string }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export type SSEEvent =
  | { node_id: string; status: 'running' }
  | { node_id: string; status: 'done'; output: string; duration_ms: number }
  | { node_id: string; status: 'error'; error: string; error_type: string; expected_type?: string; got_type?: string; duration_ms: number }
  | { node_id: string; status: 'skipped'; reason: string; duration_ms: number }
  | { node_id: string; status: 'warning'; message: string }
  | { node_id: string; status: 'retry'; attempt: number; delay_ms: number; error: string }
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
  'date-add': {
    type_mismatch: 'date-add accepts datetime or string dates. If you have a string like "2024-01-15", pass it directly — it will be auto-parsed. For other formats, use into-datetime first.',
  },
  math: {
    type_mismatch: 'math node expects numeric input. If wiring to --operand, the upstream node must output a number (e.g. const with value "42" or a wired number).',
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
  } else if (raw.includes('Network failure') || raw.includes('os error 111') || raw.includes('Connection refused') || raw.includes('unable to connect') || raw.includes('request timed out')) {
    error_type = 'network_error'
  } else if (raw.includes('Division by zero') || raw.includes('division_by_zero')) {
    error_type = 'arithmetic'
  } else if (raw.includes('429') || raw.includes('Too Many Requests') || raw.includes('rate limit')) {
    error_type = 'rate_limited'
  } else if (raw.includes('500') || raw.includes('502') || raw.includes('503') || raw.includes('504') || raw.includes('Internal Server Error') || raw.includes('Bad Gateway') || raw.includes('Service Unavailable')) {
    error_type = 'upstream_error'
  } else if (raw.includes('400') || raw.includes('Bad Request') || raw.includes('FRED series ID')) {
    error_type = 'invalid_request'
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
  if (error_type === 'type_mismatch' && expectedType && expectedType !== 'any') message += ` (expected: ${expectedType})`
  if (nodeHint) message += ` — ${nodeHint}`
  if (paramHint) message += paramHint

  const result: { message: string; error_type: string; expected_type?: string; got_type?: string } = {
    message,
    error_type,
  }
  if (error_type === 'type_mismatch' && expectedType && expectedType !== 'any') result.expected_type = expectedType
  if (got_type) result.got_type = got_type
  return result
}

// Optional handler for special built-in nodes (patch-call, kv-get, kv-set) that
// need access to TypeScript services (DB, executeGraph). Returns the JSON-serialized
// result string, or null to fall through to normal Nu execution.
export type SpecialNodeRunner = (
  nodeId: string,
  nodeType: string,
  params: Record<string, unknown>,
  pipelineInput: string | null
) => Promise<string | null>

export async function runPipeline(
  graph: Graph,
  emit: (event: SSEEvent) => void,
  specs: NodeSpec[] = [],
  specialNodeRunner?: SpecialNodeRunner
): Promise<NodeRunRecord[]> {
  const specMap = new Map<string, NodeSpec>()
  for (const s of specs) {
    specMap.set(s.name, s)
    const alias = s.name.replace(/-/g, '_')
    if (alias !== s.name) specMap.set(alias, s)
  }
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
    // Exception: single-node graphs are allowed (enables POST /exec with one source node)
    const nodeSpecEntry = specMap.get(node.type)
    const isSource = nodeSpecEntry?.input_type === 'nothing'
    const hasOutgoing = graph.edges.some(e => e.from === nodeId)
    const isSingleNode = graph.nodes.length === 1
    if (isSource && !hasOutgoing && !isSingleNode) {
      emit({ node_id: nodeId, status: 'skipped', reason: `Orphaned source node — no outgoing edges, output would be discarded.` })
      outputs.set(nodeId, 'null')
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'skipped', duration_ms: Date.now() - nodeStart })
      continue
    }

    // If any upstream dependency failed, skip this node rather than running it with null input
    const inputEdge = graph.edges.find(e => e.to === nodeId && e.to_port === 'input')
    const upstreamFailed = inputEdge ? failed.has(inputEdge.from) : false
    if (upstreamFailed) {
      emit({ node_id: nodeId, status: 'skipped', reason: `Upstream node "${inputEdge.from}" failed or was skipped.` })
      failed.add(nodeId)
      outputs.set(nodeId, 'null')
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'skipped', duration_ms: Date.now() - nodeStart })
      continue
    }

    emit({ node_id: nodeId, status: 'running' })

    // inputEdge already found above for skipping logic — reuse it here
    const pipelineInput = inputEdge ? (outputs.get(inputEdge.from) ?? null) : null

    // Special nodes (patch-call, kv-get, kv-set) handled by TypeScript, not Nu
    if (specialNodeRunner) {
      const specialResult = await specialNodeRunner(nodeId, node.type, node.params ?? {}, pipelineInput)
      if (specialResult !== null) {
        outputs.set(nodeId, specialResult)
        emit({ node_id: nodeId, status: 'done', output: specialResult, duration_ms: Date.now() - nodeStart })
        nodeRecords.push({ node_id: nodeId, type: node.type, status: 'done', duration_ms: Date.now() - nodeStart })
        continue
      }
    }

    // Resolve params — edge-connected params come from env vars.
    // Collect all param names: both statically set AND wired-only (absent from node.params).
    const paramEnv: Record<string, string> = {}
    const resolvedFlags: string[] = []

    // Extract timeout/retry settings before building flags (handled at TypeScript level)
    const timeoutMs = Number((node.params ?? {})['timeout_ms'] ?? process.env.GONUDE_TIMEOUT_MS ?? 30000)
    const maxRetries = Number((node.params ?? {})['retries'] ?? process.env.GONUDE_RETRIES ?? 1)

    const wiredPorts = new Set(
      graph.edges
        .filter(e => e.to === nodeId && e.to_port !== 'input')
        .map(e => e.to_port)
    )
    const allParamNames = new Set([...(node.params ? Object.keys(node.params) : []), ...wiredPorts])

    for (const paramName of allParamNames) {
      // Skip execution-control params that are handled at the TypeScript level
      if (paramName === 'timeout_ms' || paramName === 'retries') continue
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
        // Serialize to string for Nu — preserve JSON structure for arrays/objects
        const raw = typeof paramValue === 'string' ? paramValue : JSON.stringify(paramValue)
        const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        resolvedFlags.push(`--${paramName} "${escaped}"`)
      }
    }

    // Build Nu invocation
    const flagStr = resolvedFlags.join(' ')
    // Allowlist node.type before embedding in Nu script — defense-in-depth
    if (!/^[a-z][a-z0-9_-]*$/.test(node.type)) {
      const errMsg = `Invalid node type "${node.type}" — must match [a-z][a-z0-9_-]*`
      emit({ node_id: nodeId, status: 'error', error: errMsg, error_type: 'runtime', duration_ms: Date.now() - nodeStart })
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
    const inputExpr = pipelineInput !== null ? `($env.${PIPE_IN} | from json) | ` : ''
    // All nodes serialize to JSON — clean for API consumers and jq-able directly.
    const serialize = '| to json'
    // Use $e.json to capture the full nested error structure, not just the outer $e.msg
    const nuScript = `${buildUseLines()}; try { ${inputExpr}${cmdName} ${flagStr} ${serialize} } catch {|e| $"__GONUDE_ERROR:($e.json)" | to json }`

    // Retry loop with exponential backoff
    let attempt = 0
    let stdout = ''
    let stderr = ''
    let exitCode = 0
    let lastErrorType = 'runtime'
    let lastErrorMessage = ''
    const retryableTypes = new Set(['network_error', 'rate_limited', 'upstream_error'])

    while (attempt <= maxRetries) {
      const proc = Bun.spawn(
        ['nu', '-c', nuScript],
        {
          cwd: ROOT,
          env: { ...process.env, ...paramEnv, GONUDE_TIMEOUT_MS: String(timeoutMs), GONUDE_RETRIES: String(maxRetries) } as Record<string, string>,
          stdout: 'pipe',
          stderr: 'pipe',
        }
      )

      // Use a timeout race — Bun.spawn has no built-in timeout param
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
      const exitedPromise = proc.exited.then(() => proc.exitCode ?? 1)
      const raceResult = await Promise.race([exitedPromise, timeoutPromise])

      if (raceResult === null) {
        // Timed out — kill the process
        try { proc.kill() } catch {}
        stdout = ''
        stderr = `Process timed out after ${timeoutMs}ms`
        exitCode = 1
      } else {
        exitCode = raceResult as number
        stdout = (await new Response(proc.stdout).text()).trim()
        stderr = (await new Response(proc.stderr).text()).trim()
      }

      const nodeSpec = specMap.get(node.type)
      const expectedType = nodeSpec?.input_type

      if (exitCode !== 0) {
        const { message, error_type } = normalizeNuError(stderr, node.type, node.params, expectedType)
        lastErrorType = error_type
        lastErrorMessage = message
        if (attempt < maxRetries && retryableTypes.has(error_type)) {
          const delayMs = Math.min(2000 * (2 ** attempt), 30000) // 2s, 4s, 8s... cap 30s
          emit({ node_id: nodeId, status: 'retry', attempt: attempt + 1, delay_ms: delayMs, error: message })
          await Bun.sleep(delayMs)
          attempt++
          continue
        }
      } else if (stdout.startsWith('"__GONUDE_ERROR:')) {
        let raw: string
        try {
          const outer = JSON.parse(stdout).slice('__GONUDE_ERROR:'.length)
          const errObj = JSON.parse(outer)
          let inner = errObj
          while (inner.inner && inner.inner.length > 0) {
            inner = inner.inner[0]
          }
          raw = inner.msg || errObj.msg || outer
        } catch {
          raw = JSON.parse(stdout).slice('__GONUDE_ERROR:'.length)
        }
        const { message, error_type } = normalizeNuError(raw, node.type, node.params, expectedType)
        lastErrorType = error_type
        lastErrorMessage = message
        if (attempt < maxRetries && retryableTypes.has(error_type)) {
          const delayMs = Math.min(2000 * (2 ** attempt), 30000)
          emit({ node_id: nodeId, status: 'retry', attempt: attempt + 1, delay_ms: delayMs, error: message })
          await Bun.sleep(delayMs)
          attempt++
          continue
        }
      } else {
        // Success — break out of retry loop
        break
      }
      break // Non-retryable error or exhausted retries
    }

    const nodeSpec = specMap.get(node.type)
    const expectedType = nodeSpec?.input_type
    const durationMs = Date.now() - nodeStart

    if (exitCode !== 0) {
      const { message, error_type, expected_type, got_type } = normalizeNuError(stderr, node.type, node.params, expectedType)
      const errInfo = { error: message, error_type, expected_type, got_type }
      errors.set(nodeId, errInfo)
      emit({ node_id: nodeId, status: 'error', error: message, error_type, expected_type, got_type, duration_ms: durationMs })
      outputs.set(nodeId, 'null')
      failed.add(nodeId)
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'error', duration_ms: durationMs, error: message, error_type })
    } else if (stdout.startsWith('"__GONUDE_ERROR:')) {
      let raw: string
      try {
        const outer = JSON.parse(stdout).slice('__GONUDE_ERROR:'.length)
        const errObj = JSON.parse(outer)
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
      emit({ node_id: nodeId, status: 'error', error: message, error_type, expected_type, got_type, duration_ms: durationMs })
      outputs.set(nodeId, 'null')
      failed.add(nodeId)
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'error', duration_ms: durationMs, error: message, error_type })
    } else {
      outputs.set(nodeId, stdout)
      emit({ node_id: nodeId, status: 'done', output: stdout, duration_ms: durationMs })
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'done', duration_ms: durationMs })
      if (node.type === 'join') {
        try {
          const result = JSON.parse(stdout)
          if (Array.isArray(result) && result.length === 0) {
            emit({ node_id: nodeId, status: 'warning', message: 'join returned an empty array — check that the "on" column exists in both tables and that column names match exactly.' })
          }
        } catch {
          // stdout wasn't JSON — ignore
        }
      }
    }
  }

  emit({ status: "complete" })
  return nodeRecords
}
