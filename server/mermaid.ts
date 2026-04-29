import type { Graph } from './validate'

export function graphToMermaid(graph: Graph): string {
  const lines: string[] = ['flowchart TD']

  for (const node of graph.nodes) {
    const params = Object.entries(node.params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${String(v).replace(/"/g, '')}`)
      .join('<br/>')
    const label = params ? `${node.type}<br/>${params}` : node.type
    lines.push(`    ${node.id}["${label}"]`)
  }

  for (const edge of graph.edges) {
    if (edge.to_port === 'input') {
      lines.push(`    ${edge.from} --> ${edge.to}`)
    } else {
      lines.push(`    ${edge.from} -->|${edge.to_port}| ${edge.to}`)
    }
  }

  return lines.join('\n')
}