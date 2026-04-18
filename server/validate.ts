import type { NodeSpec } from './spec'

// Type compatibility matrix — which input types accept which output types.
// "any" on either side is always compatible.
const COMPAT: Record<string, string[]> = {
  any:      ['any', 'string', 'number', 'int', 'float', 'bool', 'table', 'list', 'record', 'datetime', 'nothing'],
  string:   ['any', 'string'],
  number:   ['any', 'number', 'int', 'float'],
  int:      ['any', 'number', 'int'],
  float:    ['any', 'number', 'float'],
  bool:     ['any', 'bool'],
  table:    ['any', 'table', 'list', 'list<any>'],  // Nu treats list<record> as a table
  list:     ['any', 'list', 'table'],   // tables are lists of records — loose but practical
  record:   ['any', 'record'],
  datetime: ['any', 'datetime'],
  nothing:  ['any', 'nothing'],
}

function typesCompatible(inputType: string, outputType: string): boolean {
  if (inputType === 'any' || outputType === 'any') return true
  return (COMPAT[inputType] ?? ['any']).includes(outputType)
}

// Levenshtein distance for "did you mean?" suggestions
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function closestType(unknown: string, known: string[]): string | null {
  let best: string | null = null, bestDist = Infinity
  for (const k of known) {
    const d = editDistance(unknown, k)
    if (d < bestDist && d <= 3) { bestDist = d; best = k }
  }
  return best
}

export interface ValidationError {
  node_id: string
  type: string
  error_type: 'unknown_type' | 'invalid_port' | 'broken_edge' | 'type_mismatch' | 'missing_param'
  message: string
  suggestion: string
}

export interface Graph {
  nodes: Array<{ id: string; type: string; params: Record<string, unknown> }>
  edges: Array<{ id: string; from: string; from_port: string; to: string; to_port: string }>
}

export function validateGraph(graph: Graph, specs: NodeSpec[]): ValidationError[] {
  const errors: ValidationError[] = []
  const specMap = new Map(specs.map(s => [s.name, s]))
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
  const knownTypes = specs.map(s => s.name)

  for (const node of graph.nodes) {
    const spec = specMap.get(node.type)

    // 1. Unknown node type
    if (!spec) {
      const suggestion = closestType(node.type, knownTypes)
      errors.push({
        node_id: node.id,
        type: node.type,
        error_type: 'unknown_type',
        message: `Node type "${node.type}" does not exist in the primitive registry.`,
        suggestion: suggestion
          ? `Did you mean "${suggestion}"? Run GET /defs for the full list.`
          : `Run GET /defs to see all available node types.`,
      })
      continue
    }

    // 2. Required params missing (not wired either)
    for (const p of spec.params) {
      if (p.required) {
        const hasStaticValue = node.params[p.name] !== undefined && node.params[p.name] !== ''
        const hasWiredEdge = graph.edges.some(e => e.to === node.id && e.to_port === p.name)
        if (!hasStaticValue && !hasWiredEdge) {
          errors.push({
            node_id: node.id,
            type: node.type,
            error_type: 'missing_param',
            message: `Required param "${p.name}" is not set and has no wired edge.`,
            suggestion: `Set "${p.name}" as a static param value, or wire an edge to that port.`,
          })
        }
      }
    }
  }

  for (const edge of graph.edges) {
    // 3. Edge references a node that doesn't exist
    if (!nodeMap.has(edge.from)) {
      errors.push({
        node_id: edge.to,
        type: nodeMap.get(edge.to)?.type ?? '?',
        error_type: 'broken_edge',
        message: `Edge "${edge.id}" references source node "${edge.from}" which does not exist.`,
        suggestion: `Check that the "from" node id is correct.`,
      })
    }
    if (!nodeMap.has(edge.to)) {
      errors.push({
        node_id: edge.from,
        type: nodeMap.get(edge.from)?.type ?? '?',
        error_type: 'broken_edge',
        message: `Edge "${edge.id}" references destination node "${edge.to}" which does not exist.`,
        suggestion: `Check that the "to" node id is correct.`,
      })
      continue
    }

    const toNode = nodeMap.get(edge.to)!
    const toSpec = specMap.get(toNode.type)

    if (toSpec && edge.to_port !== 'input') {
      // 4. Edge wired to a non-wirable param port
      const paramSpec = toSpec.params.find(p => p.name === edge.to_port)
      if (!paramSpec) {
        errors.push({
          node_id: edge.to,
          type: toNode.type,
          error_type: 'invalid_port',
          message: `Port "${edge.to_port}" does not exist on node type "${toNode.type}".`,
          suggestion: `Valid wirable params for "${toNode.type}": ${toSpec.params.filter(p => p.wirable).map(p => p.name).join(', ') || 'none'}. Check GET /defs/${toNode.type}.`,
        })
      } else if (!paramSpec.wirable) {
        errors.push({
          node_id: edge.to,
          type: toNode.type,
          error_type: 'invalid_port',
          message: `Param "${edge.to_port}" on "${toNode.type}" is not wirable — it only accepts a static value.`,
          suggestion: `Set "${edge.to_port}" as a static param value instead of wiring an edge to it.`,
        })
      }
    }

    // 5. Type mismatch between connected nodes (best-effort, skipped if type is "any")
    if (edge.to_port === 'input' && nodeMap.has(edge.from)) {
      const fromSpec = specMap.get(nodeMap.get(edge.from)!.type)
      if (fromSpec && toSpec) {
        const outType = fromSpec.output_type
        const inType = toSpec.input_type
        if (!typesCompatible(inType, outType)) {
          errors.push({
            node_id: edge.to,
            type: toNode.type,
            error_type: 'type_mismatch',
            message: `Node "${edge.from}" (${fromSpec.name}) outputs "${outType}" but "${edge.to}" (${toSpec.name}) expects "${inType}".`,
            suggestion: `Add a type conversion node between them (e.g. type_cast, from_string, col_to_list).`,
          })
        }
      }
    }
  }

  return errors
}
