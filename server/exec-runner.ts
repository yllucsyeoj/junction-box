import { runPipeline, type SSEEvent, type NodeRunRecord, type SpecialNodeRunner } from './execute'
import { validateGraph } from './validate'
import { getPatch, kvGet, kvSet } from './db'
import type { NodeSpec } from './spec'

export interface ExecResult {
  status: 'complete' | 'error'
  run_id: string
  validation_errors: any[]
  warnings: any[]
  errors: Record<string, any>
  fatal: string | null
  skipped: string[]
  outputs: Record<string, unknown>
  result: unknown
  nodeRecords?: NodeRunRecord[]
}

// ---------------------------------------------------------------------------
// Inline param injection for patch-call — mirrors index.ts injectParams
// without creating a circular dependency
// ---------------------------------------------------------------------------
function injectPatchParams(graph: any, params: Record<string, unknown>): any {
  const nodes = graph.nodes.map((node: any) => {
    if (node.type !== 'const') return node
    const val = node.params?.value
    if (typeof val !== 'string') return node
    const match = val.match(/^__param__:(.+)$/)
    if (!match) return node
    const key = match[1]
    if (!(key in params)) return node
    const raw = params[key]
    const injected = typeof raw === 'string'
      ? `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : (typeof raw === 'object' && raw !== null ? JSON.stringify(raw) : String(raw))
    return { ...node, params: { ...node.params, value: injected } }
  })
  return { ...graph, nodes }
}

// ---------------------------------------------------------------------------
// Special node runner — handles patch-call, kv-get, kv-set in TypeScript
// Returns JSON-serialized result string, or null to fall through to Nu
// ---------------------------------------------------------------------------
function makeSpecialNodeRunner(runId: string, nodeSpec: NodeSpec[]): SpecialNodeRunner {
  return async (nodeId, nodeType, params, pipelineInput) => {
    if (nodeType === 'patch-call') {
      const alias = String(params.alias ?? '')
      if (!alias) return JSON.stringify(null)
      const patch = getPatch(alias)
      if (!patch) throw new Error(`patch-call: patch "${alias}" not found`)
      const runtimeParams = (typeof params.params === 'object' && params.params !== null)
        ? params.params as Record<string, unknown>
        : {}
      const patchGraph = injectPatchParams(patch.graph, runtimeParams)
      const subResult = await executeGraph(patchGraph, nodeSpec, `${runId}-sub-${nodeId}`, 'none')
      return JSON.stringify(subResult.result)
    }

    if (nodeType === 'kv-get') {
      const key = String(params.key ?? '')
      if (!key) return JSON.stringify(null)
      const stored = kvGet(key)
      if (stored === null) {
        const def = params.default !== undefined ? params.default : null
        return JSON.stringify(def)
      }
      return stored  // already a JSON string
    }

    if (nodeType === 'kv-set') {
      const key = String(params.key ?? '')
      if (!key) return pipelineInput ?? JSON.stringify(null)
      const ttl = params.ttl_seconds !== undefined ? Number(params.ttl_seconds) : undefined
      kvSet(key, pipelineInput ?? JSON.stringify(null), ttl)
      return pipelineInput ?? JSON.stringify(null)  // pass-through
    }

    return null  // fall through to Nu execution
  }
}

export async function executeGraph(
  graph: any,
  nodeSpec: NodeSpec[],
  runId: string,
  outputsMode: 'none' | 'full' = 'none',
  onEvent?: (event: SSEEvent) => void
): Promise<ExecResult> {
  const outputs: Record<string, string> = {}
  const errors: Record<string, { message: string; error_type: string }> = {}
  const skipped: string[] = []
  const runtimeWarnings: { node_id: string; message: string }[] = []
  let fatalError: string | null = null
  let nodeRecords: NodeRunRecord[] = []
  let validationWarnings: any[] = []

  // Validate the full graph — patch-call, kv-get, kv-set are registered in BUILTIN_SPECS
  const validationResult = validateGraph(graph, nodeSpec)
  if (validationResult.errors.length > 0) {
    return {
      status: 'error',
      run_id: runId,
      validation_errors: validationResult.errors,
      warnings: validationResult.warnings || [],
      errors: {},
      fatal: null,
      skipped: [],
      outputs: {},
      result: null,
    }
  }
  validationWarnings = validationResult.warnings || []

  const specialNodeRunner = makeSpecialNodeRunner(runId, nodeSpec)

  try {
    nodeRecords = await runPipeline(graph, (event: SSEEvent) => {
      if (onEvent) onEvent(event)
      if ('node_id' in event) {
        if (event.status === 'done') outputs[event.node_id] = event.output
        if (event.status === 'error') errors[event.node_id] = { message: event.error, error_type: event.error_type, ...(event.expected_type ? { expected_type: event.expected_type } : {}), ...(event.got_type ? { got_type: event.got_type } : {}) }
        if (event.status === 'skipped') skipped.push(event.node_id)
        if (event.status === 'warning') runtimeWarnings.push({ node_id: event.node_id, message: event.message })
      }
      if ('status' in event && event.status === 'fatal') {
        fatalError = (event as { status: 'fatal'; error: string }).error
      }
    }, nodeSpec, specialNodeRunner)
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err)
  }

  const decodedOutputs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(outputs)) {
    try { decodedOutputs[k] = JSON.parse(v) } catch { decodedOutputs[k] = v }
  }

  const returnNode = graph.nodes.find((n: any) => n.type === 'return')
  const rawResult = returnNode
    ? (outputs[returnNode.id] ?? null)
    : (Object.values(outputs).at(-1) ?? null)
  const result = rawResult === null ? null : (() => {
    try { return JSON.parse(rawResult) } catch { return rawResult }
  })()

  if (fatalError || Object.keys(errors).length > 0) {
    return {
      status: 'error',
      run_id: runId,
      validation_errors: [],
      warnings: [...validationWarnings, ...runtimeWarnings],
      errors,
      fatal: fatalError,
      skipped: outputsMode !== 'none' ? skipped : [],
      outputs: outputsMode !== 'none' ? decodedOutputs : {},
      result,
      nodeRecords,
    }
  }

  return {
    status: 'complete',
    run_id: runId,
    validation_errors: [],
    warnings: [...validationWarnings, ...runtimeWarnings],
    errors: {},
    fatal: null,
    skipped: outputsMode !== 'none' ? skipped : [],
    outputs: outputsMode !== 'none' ? decodedOutputs : {},
    result,
    nodeRecords,
  }
}
