import { runPipeline, type SSEEvent, type NodeRunRecord } from './execute'
import { validateGraph } from './validate'
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

export async function executeGraph(
  graph: any,
  nodeSpec: NodeSpec[],
  runId: string,
  outputsMode: 'none' | 'full' = 'none'
): Promise<ExecResult> {
  const outputs: Record<string, string> = {}
  const errors: Record<string, { message: string; error_type: string }> = {}
  const skipped: string[] = []
  let fatalError: string | null = null
  let nodeRecords: NodeRunRecord[] = []
  let validationWarnings: any[] = []

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

  try {
    nodeRecords = await runPipeline(graph, (event: SSEEvent) => {
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

  if (fatalError || Object.keys(errors).length > 0) {
    const partialOutputs: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(outputs)) {
      try { partialOutputs[k] = JSON.parse(v) } catch { partialOutputs[k] = v }
    }
    return {
      status: 'error',
      run_id: runId,
      validation_errors: [],
      warnings: validationWarnings,
      errors,
      fatal: fatalError,
      skipped: outputsMode !== 'none' ? skipped : [],
      outputs: outputsMode !== 'none' ? partialOutputs : {},
      result: null,
      nodeRecords,
    }
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

  return {
    status: 'complete',
    run_id: runId,
    validation_errors: [],
    warnings: validationWarnings,
    errors: {},
    fatal: null,
    skipped: outputsMode !== 'none' ? skipped : [],
    outputs: outputsMode !== 'none' ? decodedOutputs : {},
    result,
    nodeRecords,
  }
}
