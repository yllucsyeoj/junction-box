/**
 * Integration tests for all GoNude pipeline primitives.
 * Each test loads a NUON graph from tests/pipelines/, runs it through
 * the execution engine, and asserts the expected output of the final node.
 *
 * Run: cd server && bun test pipeline.test.ts
 */
import { expect, test, beforeAll } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runPipeline, type SSEEvent } from './execute'

const ROOT = resolve(import.meta.dir, '..')
const PIPELINES = resolve(ROOT, 'tests/pipelines')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Graph {
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; params: Record<string, unknown> }>
  edges: Array<{ id: string; from: string; from_port: string; to: string; to_port: string }>
}

function loadGraph(filename: string): Graph {
  const text = readFileSync(resolve(PIPELINES, filename), 'utf8')
  // Strip JSON comments (lines starting with _comment keys are ignored by JSON.parse as data)
  return JSON.parse(text)
}

async function run(filename: string): Promise<{ outputs: Map<string, string>; errors: Map<string, string> }> {
  const graph = loadGraph(filename)
  const outputs = new Map<string, string>()
  const errors = new Map<string, string>()

  await runPipeline(graph as any, (event: SSEEvent) => {
    if ('node_id' in event) {
      if (event.status === 'done') outputs.set(event.node_id, event.output)
      if (event.status === 'error') errors.set(event.node_id, event.error)
    }
  })

  return { outputs, errors }
}

function noErrors(errors: Map<string, string>) {
  if (errors.size > 0) {
    const msg = [...errors.entries()].map(([id, e]) => `${id}: ${e}`).join('\n')
    throw new Error(`Pipeline had errors:\n${msg}`)
  }
}

// ---------------------------------------------------------------------------
// 01 — Input nodes
// ---------------------------------------------------------------------------

test('const: number value', async () => {
  const { outputs, errors } = await run('01-const-number.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('42')
})

test('const: string value', async () => {
  const { outputs, errors } = await run('01-const-string.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('"hello world"')
})

test('const: list value', async () => {
  const { outputs, errors } = await run('01-const-list.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('[1, 2, 3, 4, 5]')
})

test('env: reads HOME environment variable', async () => {
  const { outputs, errors } = await run('01-env.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result.length).toBeGreaterThan(0)
  // HOME is a path string — should be quoted NUON
  expect(result.startsWith('"')).toBe(true)
})

test('file-in: reads sample CSV as table', async () => {
  const { outputs, errors } = await run('01-file-in.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('Alice')
  expect(result).toContain('Bob')
  expect(result).toContain('Carol')
})

// ---------------------------------------------------------------------------
// 02 — Math operations
// ---------------------------------------------------------------------------

test('math: addition (10 + 5 = 15)', async () => {
  const { outputs, errors } = await run('02-math-add.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('15.0')
})

test('math: subtraction (20 - 7 = 13)', async () => {
  const { outputs, errors } = await run('02-math-subtract.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('13.0')
})

test('math: multiplication (3 * 4 = 12)', async () => {
  const { outputs, errors } = await run('02-math-multiply.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('12.0')
})

test('math: division (10 / 4 = 2.5)', async () => {
  const { outputs, errors } = await run('02-math-divide.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('2.5')
})

test('math: operand wired via edge param (10 + 7 = 17)', async () => {
  const { outputs, errors } = await run('02-math-edge-param.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('17.0')
})

// ---------------------------------------------------------------------------
// 03 — Table transforms
// ---------------------------------------------------------------------------

test('filter: greater-than keeps rows with age > 30', async () => {
  const { outputs, errors } = await run('03-filter-gt.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('Alice')
  expect(result).toContain('Carol')
  expect(result).not.toContain('Bob')
  expect(result).not.toContain('Dave')
})

test('filter: equals keeps matching city', async () => {
  const { outputs, errors } = await run('03-filter-eq.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('Alice')
  expect(result).toContain('Carol')
  expect(result).not.toContain('Bob')
})

test('filter: contains matches substring in column', async () => {
  const { outputs, errors } = await run('03-filter-contains.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('Alice')
  expect(result).toContain('Carol')
  expect(result).not.toContain('Bob')
})

test('map: adds new column to every row', async () => {
  const { outputs, errors } = await run('03-map.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('active')
  expect(result).toContain('Alice')
  expect(result).toContain('Bob')
})

test('select: keeps only specified columns', async () => {
  const { outputs, errors } = await run('03-select.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('name')
  expect(result).toContain('city')
  expect(result).not.toContain('age')
})

test('sort: ascending by age — Dave first', async () => {
  const { outputs, errors } = await run('03-sort-asc.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  const davePos = result.indexOf('Dave')
  const carolPos = result.indexOf('Carol')
  expect(davePos).toBeGreaterThan(-1)
  expect(carolPos).toBeGreaterThan(-1)
  expect(davePos).toBeLessThan(carolPos)
})

test('sort: descending by age — Carol first', async () => {
  const { outputs, errors } = await run('03-sort-desc.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  const carolPos = result.indexOf('Carol')
  const davePos = result.indexOf('Dave')
  expect(carolPos).toBeLessThan(davePos)
})

// ---------------------------------------------------------------------------
// 04 — New transform primitives
// ---------------------------------------------------------------------------

test('count: returns row count as integer', async () => {
  const { outputs, errors } = await run('04-count.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('4')
})

test('first: returns first 2 rows', async () => {
  const { outputs, errors } = await run('04-first.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('Alice')
  expect(result).toContain('Bob')
  expect(result).not.toContain('Carol')
  expect(result).not.toContain('Dave')
})

test('last: returns last 2 rows', async () => {
  const { outputs, errors } = await run('04-last.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('Carol')
  expect(result).toContain('Dave')
  expect(result).not.toContain('Alice')
  expect(result).not.toContain('Bob')
})

test('rename: renames column age → years', async () => {
  const { outputs, errors } = await run('04-rename.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('years')
  expect(result).not.toContain('age')
})

test('get: extracts field from record', async () => {
  const { outputs, errors } = await run('04-get-record.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('"Alice"')
})

test('get: extracts index from list (index 2 = 30)', async () => {
  const { outputs, errors } = await run('04-get-list.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('30')
})

// ---------------------------------------------------------------------------
// 05 — Compute nodes
// ---------------------------------------------------------------------------

test('type-cast: string "42" → int 42', async () => {
  const { outputs, errors } = await run('05-type-cast-to-int.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('42')
})

test('type-cast: int 99 → string "99"', async () => {
  const { outputs, errors } = await run('05-type-cast-to-string.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('"99"')
})

test('string-op: upcase', async () => {
  const { outputs, errors } = await run('05-string-op-upcase.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('"HELLO WORLD"')
})

test('string-op: trim removes surrounding whitespace', async () => {
  const { outputs, errors } = await run('05-string-op-trim.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('"trimmed"')
})

test('string-op: split on comma → list of 3', async () => {
  const { outputs, errors } = await run('05-string-op-split.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('[a, b, c]')
})

test('to-string: formats record as JSON string', async () => {
  const { outputs, errors } = await run('05-to-string-json.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  // Output is a NUON-quoted JSON string — should contain the keys
  expect(result).toContain('x')
  expect(result).toContain('y')
  expect(result).toContain('1')
  expect(result).toContain('2')
})

test('from-string: parses JSON string into record', async () => {
  const { outputs, errors } = await run('05-from-string-json.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('x')
  expect(result).toContain('1')
})

// ---------------------------------------------------------------------------
// 06 — Output nodes
// ---------------------------------------------------------------------------

test('display: completes without error (nothing output)', async () => {
  const { errors } = await run('06-display.nuon')
  noErrors(errors)
  // display outputs nothing — no return node, just check no error
})

test('file-out: writes to /tmp without error', async () => {
  const { errors } = await run('06-file-out.nuon')
  noErrors(errors)
})

test('file-out + file-in: roundtrip preserves value', async () => {
  // file-out outputs nothing so there is no edge to enforce ordering in a single graph.
  // Run the two pipelines sequentially: write first, then read.
  const writeGraph = loadGraph('06-file-roundtrip.nuon')
  // Only execute the write side: nodes data + write, edge e1
  const writeOnly = {
    nodes: writeGraph.nodes.filter(n => ['data', 'write'].includes(n.id)),
    edges: writeGraph.edges.filter(e => e.id === 'e1'),
  }
  const { errors: writeErrors } = await (async () => {
    const errors = new Map<string, string>()
    await runPipeline(writeOnly as any, (event: SSEEvent) => {
      if ('node_id' in event && event.status === 'error') errors.set(event.node_id, event.error)
    })
    return { errors }
  })()
  noErrors(writeErrors)

  // Now read the file back
  const readGraph = {
    nodes: writeGraph.nodes.filter(n => ['read', 'out'].includes(n.id)),
    edges: writeGraph.edges.filter(e => e.id === 'e2'),
  }
  const outputs = new Map<string, string>()
  const readErrors = new Map<string, string>()
  await runPipeline(readGraph as any, (event: SSEEvent) => {
    if ('node_id' in event) {
      if (event.status === 'done') outputs.set(event.node_id, event.output)
      if (event.status === 'error') readErrors.set(event.node_id, event.error)
    }
  })
  noErrors(readErrors)
  const result = outputs.get('out') ?? ''
  expect(result).toContain('100')
  expect(result).toContain('200')
})

// ---------------------------------------------------------------------------
// 07 — Multi-step chains
// ---------------------------------------------------------------------------

test('chain: filter → sort desc → first 2 (top 2 oldest over 20)', async () => {
  const { outputs, errors } = await run('07-chain-filter-sort-first.nuon')
  noErrors(errors)
  const result = outputs.get('out') ?? ''
  // Should have Carol(40) and Alice(35) — top 2 after filtering Eve(18)
  expect(result).toContain('Carol')
  expect(result).toContain('Alice')
  expect(result).not.toContain('Eve')
  // Carol should appear before Alice (desc sort)
  expect(result.indexOf('Carol')).toBeLessThan(result.indexOf('Alice'))
})

test('chain: math pipeline ((10+5)*2)-1 = 29', async () => {
  const { outputs, errors } = await run('07-chain-math-pipeline.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('29.0')
})

test('chain: string trim → upcase', async () => {
  const { outputs, errors } = await run('07-chain-string-transform.nuon')
  noErrors(errors)
  expect(outputs.get('out')).toBe('"HELLO WORLD"')
})

// ---------------------------------------------------------------------------
// 08 — Multi-source graphs
// ---------------------------------------------------------------------------

test('two sources: lhs=100 / rhs=3 via edge param', async () => {
  const { outputs, errors } = await run('08-two-sources.nuon')
  noErrors(errors)
  // 100 / 3 ≈ 33.33...
  const result = parseFloat(outputs.get('out') ?? '0')
  expect(result).toBeCloseTo(33.333, 2)
})
