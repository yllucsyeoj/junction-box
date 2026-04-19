import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { toposort } from './toposort'

const ROOT = resolve(import.meta.dir, '..')

function buildUseLines(): string {
  const extDir = resolve(ROOT, 'extensions')
  const exts = existsSync(extDir)
    ? readdirSync(extDir).filter(f => f.endsWith('.nu')).map(f => `use extensions/${f} *`)
    : []
  return ['use primitives.nu *', ...exts].join('; ')
}

interface GraphNode { id: string; type: string; params: Record<string, unknown> }
interface GraphEdge { id: string; from: string; from_port: string; to: string; to_port: string }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export type SSEEvent =
  | { node_id: string; status: 'running' }
  | { node_id: string; status: 'done'; output: string }
  | { node_id: string; status: 'error'; error: string; error_type: string }
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

// Strip internal file/line references from Nu error output and return a clean message.
function normalizeNuError(raw: string, nodeType: string, params: Record<string, unknown>): { message: string; error_type: string } {
  // Remove Nu source location lines like ",-[primitives.nu:209:5]" and surrounding context
  const stripped = raw
    .replace(/\s*,?-\[.*?:\d+:\d+\][\s\S]*?`----/g, '')   // strip source context blocks
    .replace(/Error:\s*nu::[a-z_:]+\n/g, '')                // strip internal error type header
    .replace(/  x /g, '')                                    // strip Nu "x" prefix
    .replace(/\n+/g, ' ')
    .trim()

  // Classify error type from Nu message patterns
  let error_type = 'runtime'
  if (raw.includes('pipeline_mismatch') || raw.includes('cant_convert') || raw.includes('type_mismatch')) {
    error_type = 'type_mismatch'
  } else if (raw.includes('column_not_found') || raw.includes('CantFindColumn') || raw.includes('cannot find column')) {
    error_type = 'missing_column'
  } else if (raw.includes('expected_keyword') || raw.includes('parser')) {
    error_type = 'syntax'
  } else if (raw.includes('NotFound') || raw.includes('not found')) {
    error_type = 'not_found'
  } else if (raw.includes('Network failure') || raw.includes('os error 111') || raw.includes('Connection refused') || raw.includes('unable to connect')) {
    error_type = 'network_error'
  }

  // Try to add a hint about which param might be wrong based on the message
  const paramHints: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (stripped.toLowerCase().includes(String(v).toLowerCase().slice(0, 6))) {
      paramHints.push(k)
    }
  }
  const hint = paramHints.length > 0 ? ` (check param: ${paramHints.join(', ')})` : ''

  return { message: (stripped || raw.trim()) + hint, error_type }
}

export async function runPipeline(
  graph: Graph,
  emit: (event: SSEEvent) => void
): Promise<NodeRunRecord[]> {
  // Validate and determine execution order
  const order = toposort(
    graph.nodes.map(n => n.id),
    graph.edges.map(e => ({ from: e.from, to: e.to }))
  )

  const outputs = new Map<string, string>()   // node_id -> NUON string
  const failed = new Set<string>()            // nodes that errored or were skipped
  const nodeRecords: NodeRunRecord[] = []

  for (const nodeId of order) {
    const node = graph.nodes.find(n => n.id === nodeId)!
    const nodeStart = Date.now()

    // If any upstream dependency failed, skip this node rather than running it with null input
    const inputEdge = graph.edges.find(e => e.to === nodeId && e.to_port === 'input')
    if (inputEdge && failed.has(inputEdge.from)) {
      emit({ node_id: nodeId, status: 'skipped', reason: `Upstream node "${inputEdge.from}" failed or was skipped.` })
      failed.add(nodeId)
      outputs.set(nodeId, 'null')
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'skipped', duration_ms: Date.now() - nodeStart })
      continue
    }

    emit({ node_id: nodeId, status: 'running' })

    // inputEdge already found above for skipping logic — reuse it here
    const pipelineInput = inputEdge ? (outputs.get(inputEdge.from) ?? null) : null

    // Resolve params — edge-connected params come from env vars.
    // Collect all param names: both statically set AND wired-only (absent from node.params).
    const paramEnv: Record<string, string> = {}
    const resolvedFlags: string[] = []

    const wiredPorts = new Set(
      graph.edges
        .filter(e => e.to === nodeId && e.to_port !== 'input')
        .map(e => e.to_port)
    )
    const allParamNames = new Set([...Object.keys(node.params), ...wiredPorts])

    for (const paramName of allParamNames) {
      const paramValue = node.params[paramName] ?? ''
      const paramEdge = graph.edges.find(e => e.to === nodeId && e.to_port === paramName)
      if (paramEdge) {
        // Pass edge value via env var (JSON string). Primitives use from nuon internally —
        // JSON is valid NUON syntax for all wire types (arrays, objects, primitives).
        const envKey = `GONUDE_PARAM_${paramName.toUpperCase()}`
        paramEnv[envKey] = outputs.get(paramEdge.from) ?? 'null'
        resolvedFlags.push(`--${paramName} $env.${envKey}`)
      } else {
        // Escape string value for Nu — wrap in quotes, escape inner quotes
        const escaped = String(paramValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        resolvedFlags.push(`--${paramName} "${escaped}"`)
      }
    }

    // Build Nu invocation
    const flagStr = resolvedFlags.join(' ')
    const cmdName = `prim-${node.type}`
    // Pass pipeline input via env var — to json produces multi-line output which
    // would break Nu string-literal embedding; env vars handle arbitrary content safely.
    const PIPE_IN = 'GONUDE_PIPE_IN'
    if (pipelineInput !== null) paramEnv[PIPE_IN] = pipelineInput
    const inputExpr = pipelineInput !== null ? `($env.${PIPE_IN} | from json) | ` : ''
    // All nodes serialize to JSON — clean for API consumers and jq-able directly.
    const serialize = '| to json'
    const nuScript = `${buildUseLines()}; try { ${inputExpr}${cmdName} ${flagStr} ${serialize} } catch {|e| $"__GONUDE_ERROR:($e.msg)" | to json }`

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

    if (proc.exitCode !== 0) {
      // Parse/syntax error — Nu couldn't compile the script
      const { message, error_type } = normalizeNuError(stderr, node.type, node.params)
      emit({ node_id: nodeId, status: 'error', error: message, error_type })
      outputs.set(nodeId, 'null')
      failed.add(nodeId)
      nodeRecords.push({ node_id: nodeId, type: node.type, status: 'error', duration_ms: Date.now() - nodeStart, error: message, error_type })
    } else if (stdout.startsWith('"__GONUDE_ERROR:')) {
      // Runtime error caught by try/catch wrapper
      const raw = JSON.parse(stdout).slice('__GONUDE_ERROR:'.length)
      const { message, error_type } = normalizeNuError(raw, node.type, node.params)
      emit({ node_id: nodeId, status: 'error', error: message, error_type })
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
