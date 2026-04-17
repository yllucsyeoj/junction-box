import { resolve } from 'node:path'
import { toposort } from './toposort'

const ROOT = resolve(import.meta.dir, '..')

interface GraphNode { id: string; type: string; params: Record<string, unknown> }
interface GraphEdge { id: string; from: string; from_port: string; to: string; to_port: string }
interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export type SSEEvent =
  | { node_id: string; status: 'running' }
  | { node_id: string; status: 'done'; output: string }
  | { node_id: string; status: 'error'; error: string }
  | { status: 'complete' }

export async function runPipeline(
  graph: Graph,
  emit: (event: SSEEvent) => void
): Promise<void> {
  // Validate and determine execution order
  const order = toposort(
    graph.nodes.map(n => n.id),
    graph.edges.map(e => ({ from: e.from, to: e.to }))
  )

  const outputs = new Map<string, string>() // node_id -> NUON string

  for (const nodeId of order) {
    const node = graph.nodes.find(n => n.id === nodeId)!
    emit({ node_id: nodeId, status: 'running' })

    // Find upstream pipeline input (primary input port)
    const inputEdge = graph.edges.find(e => e.to === nodeId && e.to_port === 'input')
    const pipelineInput = inputEdge ? (outputs.get(inputEdge.from) ?? null) : null

    // Resolve params — edge-connected params come from env vars
    const paramEnv: Record<string, string> = {}
    const resolvedFlags: string[] = []

    for (const [paramName, paramValue] of Object.entries(node.params)) {
      const paramEdge = graph.edges.find(e => e.to === nodeId && e.to_port === paramName)
      if (paramEdge) {
        // Pass edge value via environment variable
        const envKey = `GONUDE_PARAM_${paramName.toUpperCase()}`
        paramEnv[envKey] = outputs.get(paramEdge.from) ?? 'null'
        resolvedFlags.push(`--${paramName} ($env.${envKey} | from nuon)`)
      } else {
        // Escape string value for Nu — wrap in quotes, escape inner quotes
        const escaped = String(paramValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        resolvedFlags.push(`--${paramName} "${escaped}"`)
      }
    }

    // Build Nu invocation
    const flagStr = resolvedFlags.join(' ')
    const cmdName = `prim-${node.type}`
    const inputExpr = pipelineInput !== null
      ? `("${pipelineInput.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" | from nuon) | `
      : ''
    const nuScript = `use primitives.nu *; ${inputExpr}${cmdName} ${flagStr} | to nuon`

    const proc = Bun.spawnSync(
      ['nu', '-c', nuScript],
      {
        cwd: ROOT,
        env: { ...process.env, ...paramEnv } as Record<string, string>,
        stderr: 'pipe',
      }
    )

    if (proc.exitCode !== 0) {
      const errMsg = Buffer.from(proc.stderr).toString().trim()
      emit({ node_id: nodeId, status: 'error', error: errMsg })
      return // Stop on first error
    }

    const output = Buffer.from(proc.stdout).toString().trim()
    outputs.set(nodeId, output)
    emit({ node_id: nodeId, status: 'done', output })
  }

  emit({ status: 'complete' })
}
