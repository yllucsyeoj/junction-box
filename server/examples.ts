// Minimal working example graphs for each node type.
// Used by /defs to give models instant context on how to use a node.

type MiniGraph = { nodes: object[]; edges: object[] }

// Helper to make a linear 2-node graph: src → node → return
function linear(srcType: string, srcParams: object, nodeType: string, nodeParams: object): MiniGraph {
  return {
    nodes: [
      { id: 'src', type: srcType, position: { x: 0, y: 0 }, params: srcParams },
      { id: 'op', type: nodeType, position: { x: 200, y: 0 }, params: nodeParams },
      { id: 'out', type: 'return', position: { x: 400, y: 0 }, params: {} },
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  }
}

function constSrc(value: string) { return { id: 'src', type: 'const', position: { x: 0, y: 0 }, params: { value } } }
function ret(x = 600) { return { id: 'out', type: 'return', position: { x, y: 0 }, params: {} } }

export const EXAMPLES: Record<string, MiniGraph> = {

  fetch: {
    nodes: [
      { id: 'src', type: 'fetch', position: { x: 0, y: 0 }, params: { url: 'https://jsonplaceholder.typicode.com/users' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  const: {
    nodes: [
      { id: 'src', type: 'const', position: { x: 0, y: 0 }, params: { value: '[1, 2, 3]' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  env: {
    nodes: [
      { id: 'src', type: 'env', position: { x: 0, y: 0 }, params: { key: 'HOME' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  file_in: linear('const', { value: '"test.json"' }, 'file_in', { path: 'test.json' }),

  filter: linear('const', { value: '[[name age]; [alice 30] [bob 17] [carol 25]]' }, 'filter', { column: 'age', op: '>', value: '18' }),

  map: linear('const', { value: '[[name]; [alice] [bob]]' }, 'map', { column: 'active', value: 'true' }),

  select: linear('const', { value: '[[a b c]; [1 2 3]]' }, 'select', { columns: 'a b' }),

  sort: linear('const', { value: '[[name score]; [alice 90] [bob 70] [carol 85]]' }, 'sort', { column: 'score', direction: 'desc' }),

  count: linear('const', { value: '[[a]; [1] [2] [3]]' }, 'count', {}),

  first: linear('const', { value: '[[a]; [1] [2] [3] [4] [5]]' }, 'first', { n: '3' }),

  last: linear('const', { value: '[[a]; [1] [2] [3] [4] [5]]' }, 'last', { n: '2' }),

  rename: linear('const', { value: '[[old_name]; [alice]]' }, 'rename', { from: 'old_name', to: 'name' }),

  get: linear('const', { value: '{name: "alice", age: 30}' }, 'get', { key: 'name' }),

  merge: {
    nodes: [
      constSrc('{a: 1, b: 2}'),
      { id: 'extra', type: 'const', position: { x: 0, y: 80 }, params: { value: '{b: 99, c: 3}' } },
      { id: 'op', type: 'merge', position: { x: 200, y: 0 }, params: { with: '{}' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'extra', from_port: 'output', to: 'op', to_port: 'with' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  reject: linear('const', { value: '[[a b c]; [1 2 3]]' }, 'reject', { columns: 'b c' }),

  update: linear('const', { value: '{name: "alice", score: 0}' }, 'update', { field: 'score', value: '100' }),

  group_by: linear('const', { value: '[[cat val]; [A 1] [A 2] [B 3]]' }, 'group_by', { column: 'cat' }),

  reduce: linear('const', { value: '[10, 20, 30]' }, 'reduce', { op: 'avg', sep: '' }),

  uniq: linear('const', { value: '[1, 2, 2, 3, 3, 3]' }, 'uniq', {}),

  math: {
    nodes: [
      constSrc('10'),
      { id: 'rhs', type: 'const', position: { x: 0, y: 80 }, params: { value: '3' } },
      { id: 'op', type: 'math', position: { x: 200, y: 0 }, params: { op: '+', operand: '0' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'rhs', from_port: 'output', to: 'op', to_port: 'operand' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  math_fn: linear('const', { value: '[4.7, 2.1, 8.9]' }, 'math_fn', { op: 'avg', column: '' }),

  string_op: linear('const', { value: '"  hello world  "' }, 'string_op', { op: 'trim', arg: '' }),

  type_cast: linear('const', { value: '"42"' }, 'type_cast', { target: 'int' }),

  each: linear('const', { value: '[1, 2, 3, 4]' }, 'each', { expr: '$in * $in' }),

  str_concat: {
    nodes: [
      constSrc('"world"'),
      { id: 'pre', type: 'const', position: { x: 0, y: 80 }, params: { value: '"Hello, "' } },
      { id: 'op', type: 'str-concat', position: { x: 200, y: 0 }, params: { prefix: '', suffix: '!' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'pre', from_port: 'output', to: 'op', to_port: 'prefix' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'str-concat': undefined as any, // alias handled above

  str_interp: linear('const', { value: '{name: "Alice", score: 95}' }, 'str-interp', { template: 'Player {name} scored {score} points!' }),

  url_encode: linear('const', { value: '"hello world & more"' }, 'url-encode', {}),
  url_decode: linear('const', { value: '"hello%20world%20%26%20more"' }, 'url-decode', {}),

  to_string: linear('const', { value: '{a: 1, b: [2, 3]}' }, 'to-string', { format: 'json' }),
  from_string: linear('const', { value: '"{\\"a\\": 1}"' }, 'from-string', { format: 'json' }),

  append: {
    nodes: [
      constSrc('[1, 2, 3]'),
      { id: 'extra', type: 'const', position: { x: 0, y: 80 }, params: { value: '[4, 5]' } },
      { id: 'op', type: 'append', position: { x: 200, y: 0 }, params: { items: '[]' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'extra', from_port: 'output', to: 'op', to_port: 'items' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  flatten: linear('const', { value: '[[1, 2], [3, 4], [5]]' }, 'flatten', {}),
  reverse: linear('const', { value: '[1, 2, 3, 4, 5]' }, 'reverse', {}),
  drop: linear('const', { value: '[1, 2, 3, 4, 5]' }, 'drop', { n: '2' }),
  enumerate: linear('const', { value: '["a", "b", "c"]' }, 'enumerate', {}),
  wrap: linear('const', { value: '"single value"' }, 'wrap', {}),

  join: {
    nodes: [
      constSrc('[[id name]; [1 alice] [2 bob]]'),
      { id: 'scores', type: 'const', position: { x: 0, y: 80 }, params: { value: '[[id score]; [1 90] [2 75]]' } },
      { id: 'op', type: 'join', position: { x: 200, y: 0 }, params: { on: 'id', type: 'inner', right: '[]' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'scores', from_port: 'output', to: 'op', to_port: 'right' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  table_concat: {
    nodes: [
      constSrc('[[a b]; [1 2] [3 4]]'),
      { id: 'more_data', type: 'const', position: { x: 0, y: 80 }, params: { value: '[[a b]; [5 6] [7 8]]' } },
      { id: 'op', type: 'table-concat', position: { x: 200, y: 0 }, params: { more: '[]' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'more_data', from_port: 'output', to: 'op', to_port: 'more' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  insert_row: {
    nodes: [
      constSrc('[[name score]; [alice 90] [bob 75]]'),
      { id: 'new_row', type: 'const', position: { x: 0, y: 80 }, params: { value: '{name: "carol", score: 88}' } },
      { id: 'op', type: 'insert-row', position: { x: 200, y: 0 }, params: { row: '{}' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'new_row', from_port: 'output', to: 'op', to_port: 'row' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  col_to_list: linear('const', { value: '[[name score]; [alice 90] [bob 75]]' }, 'col-to-list', { column: 'score' }),
  col_stats: linear('const', { value: '[[price]; [10] [20] [15] [30] [25]]' }, 'col-stats', { column: 'price' }),

  summarize: linear(
    'const',
    { value: '[[price qty]; [10 2] [20 5] [15 3]]' },
    'summarize',
    { cols: 'price qty', ops: 'avg sum' }
  ),

  null_fill: linear(
    'const',
    { value: '[[a b]; [1 null] [2 5] [3 null]]' },
    'null-fill',
    { column: 'b', op: 'const', value: '0' }
  ),

  group_agg: {
    nodes: [
      constSrc('[[cat val]; [A 10] [A 30] [B 5] [B 15]]'),
      { id: 'grp', type: 'group-by', position: { x: 200, y: 0 }, params: { column: 'cat' } },
      { id: 'agg', type: 'group-agg', position: { x: 400, y: 0 }, params: { column: 'val', op: 'avg' } },
      ret(600),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'grp', to_port: 'input' },
      { id: 'e2', from: 'grp', from_port: 'output', to: 'agg', to_port: 'input' },
      { id: 'e3', from: 'agg', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  transpose: linear('const', { value: '{foo: 1, bar: 2, baz: 3}' }, 'transpose', {}),
  values: linear('const', { value: '{a: 10, b: 20, c: 30}' }, 'values', {}),
  columns: linear('const', { value: '[[x y z]; [1 2 3]]' }, 'columns', {}),

  zip: {
    nodes: [
      constSrc('["alice", "bob", "carol"]'),
      { id: 'scores', type: 'const', position: { x: 0, y: 80 }, params: { value: '[90, 75, 88]' } },
      { id: 'op', type: 'zip', position: { x: 200, y: 0 }, params: { right: '[]', key_a: 'name', key_b: 'score' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'scores', from_port: 'output', to: 'op', to_port: 'right' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  batch: linear('const', { value: '[1, 2, 3, 4, 5, 6, 7]' }, 'batch', { size: '3' }),

  window: linear(
    'const',
    { value: '[[day price]; [1 10] [2 12] [3 11] [4 14] [5 13]]' },
    'window',
    { column: 'price', size: '3', op: 'avg', as_col: 'ma3' }
  ),

  row_apply: linear(
    'const',
    { value: '[[name price qty]; [apple 1.5 3] [banana 0.8 5]]' },
    'row-apply',
    { expr: '$in.price * $in.qty', as_col: 'total' }
  ),

  display: linear('const', { value: '42' }, 'display', {}),

  file_out: {
    nodes: [
      constSrc('[{a: 1}, {a: 2}]'),
      { id: 'op', type: 'file-out', position: { x: 200, y: 0 }, params: { path: '/tmp/out.json', format: 'json' } },
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
    ],
  },

  return: linear('const', { value: '"the answer is 42"' }, 'return', {}),

  llm: {
    nodes: [
      constSrc('"What is 2 + 2? Answer in one word."'),
      { id: 'ctx', type: 'const', position: { x: 0, y: 80 }, params: { value: '"You are a terse assistant."' } },
      { id: 'op', type: 'llm', position: { x: 200, y: 0 }, params: { model: 'claude-haiku-4-5-20251001', context: '' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'ctx', from_port: 'output', to: 'op', to_port: 'context' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  http_post: {
    nodes: [
      constSrc('{title: "test", body: "hello", userId: 1}'),
      { id: 'op', type: 'http-post', position: { x: 200, y: 0 }, params: { url: 'https://jsonplaceholder.typicode.com/posts', content_type: 'application/json' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  ls: {
    nodes: [
      { id: 'src', type: 'ls', position: { x: 0, y: 0 }, params: { path: '.' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  date_now: {
    nodes: [
      { id: 'src', type: 'date-now', position: { x: 0, y: 0 }, params: {} },
      { id: 'fmt', type: 'date-format', position: { x: 200, y: 0 }, params: { fmt: '%Y-%m-%d' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'fmt', to_port: 'input' },
      { id: 'e2', from: 'fmt', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  date_format: linear('const', { value: '2024-01-15T10:30:00+00:00' }, 'date-format', { fmt: '%Y-%m-%d' }),
  into_datetime: linear('const', { value: '"2024-01-15"' }, 'into-datetime', { fmt: '%Y-%m-%d' }),
  date_add: linear('const', { value: '2024-01-15T00:00:00+00:00' }, 'date-add', { amount: '7day' }),

  if: linear('const', { value: '42' }, 'if', { column: '', op: '>', value: '10', fallback: '0' }),
}
