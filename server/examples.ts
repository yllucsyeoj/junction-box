// Minimal working example graphs for each node type.
// Used by /defs to give models instant context on how to use a node.
// Keys must match node names exactly (hyphens, not underscores).
// No position fields — they are ignored at execution time.

type MiniGraph = { nodes: object[]; edges: object[] }

// Helper to make a linear 3-node graph: src → op → return
function linear(srcType: string, srcParams: object, nodeType: string, nodeParams: object): MiniGraph {
  return {
    nodes: [
      { id: 'src', type: srcType, params: srcParams },
      { id: 'op', type: nodeType, params: nodeParams },
      { id: 'out', type: 'return', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  }
}

function constSrc(value: string) { return { id: 'src', type: 'const', params: { value } } }
function ret() { return { id: 'out', type: 'return', params: {} } }

export const EXAMPLES: Record<string, MiniGraph> = {

  // ── Input ──────────────────────────────────────────────────────────────────

  fetch: {
    nodes: [
      { id: 'src', type: 'fetch', params: { url: 'https://jsonplaceholder.typicode.com/users' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  const: {
    nodes: [
      { id: 'src', type: 'const', params: { value: '[1, 2, 3]' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  env: {
    nodes: [
      { id: 'src', type: 'env', params: { key: 'HOME' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'file-in': linear('const', { value: '"test.json"' }, 'file-in', { path: 'test.json' }),

  // ── Transform ──────────────────────────────────────────────────────────────

  filter: linear('const', { value: '[[name age]; [alice 30] [bob 17] [carol 25]]' }, 'filter', { column: 'age', op: '>', value: '18' }),

  map: linear('const', { value: '[[name]; [alice] [bob]]' }, 'map', { column: 'active', value: 'true' }),

  select: linear('const', { value: '[[a b c]; [1 2 3]]' }, 'select', { columns: 'a,b' }),

  reject: linear('const', { value: '[[a b c]; [1 2 3]]' }, 'reject', { columns: 'b,c' }),

  sort: linear('const', { value: '[[name score]; [alice 90] [bob 70] [carol 85]]' }, 'sort', { column: 'score', direction: 'desc' }),

  count: linear('const', { value: '[[a]; [1] [2] [3]]' }, 'count', {}),

  first: linear('const', { value: '[[a]; [1] [2] [3] [4] [5]]' }, 'first', { n: '3' }),

  last: linear('const', { value: '[[a]; [1] [2] [3] [4] [5]]' }, 'last', { n: '2' }),

  rename: linear('const', { value: '[[old_name]; [alice]]' }, 'rename', { from: 'old_name', to: 'name' }),

  get: linear('const', { value: '{name: "alice", age: 30}' }, 'get', { key: 'name' }),

  update: linear('const', { value: '{name: "alice", score: 0}' }, 'update', { field: 'score', value: '100' }),

  merge: {
    nodes: [
      constSrc('{a: 1, b: 2}'),
      { id: 'extra', type: 'const', params: { value: '{b: 99, c: 3}' } },
      { id: 'op', type: 'merge', params: { with: '{}' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'extra', from_port: 'output', to: 'op', to_port: 'with' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'group-by': linear('const', { value: '[[cat val]; [A 1] [A 2] [B 3]]' }, 'group-by', { column: 'cat' }),

  reduce: linear('const', { value: '[10, 20, 30]' }, 'reduce', { op: 'avg', sep: '' }),

  uniq: linear('const', { value: '[1, 2, 2, 3, 3, 3]' }, 'uniq', {}),

  flatten: linear('const', { value: '[[1, 2], [3, 4], [5]]' }, 'flatten', {}),

  reverse: linear('const', { value: '[1, 2, 3, 4, 5]' }, 'reverse', {}),

  drop: linear('const', { value: '[1, 2, 3, 4, 5]' }, 'drop', { n: '2' }),

  enumerate: linear('const', { value: '["a", "b", "c"]' }, 'enumerate', {}),

  wrap: linear('const', { value: '"single value"' }, 'wrap', {}),

  join: {
    nodes: [
      constSrc('[[id name]; [1 alice] [2 bob]]'),
      { id: 'scores', type: 'const', params: { value: '[[id score]; [1 90] [2 75]]' } },
      { id: 'op', type: 'join', params: { on: 'id', type: 'inner', right: '[]' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'scores', from_port: 'output', to: 'op', to_port: 'right' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'table-concat': {
    nodes: [
      constSrc('[[a b]; [1 2] [3 4]]'),
      { id: 'more_data', type: 'const', params: { value: '[[a b]; [5 6] [7 8]]' } },
      { id: 'op', type: 'table-concat', params: { more: '[]' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'more_data', from_port: 'output', to: 'op', to_port: 'more' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'insert-row': {
    nodes: [
      constSrc('[[name score]; [alice 90] [bob 75]]'),
      { id: 'new_row', type: 'const', params: { value: '{name: "carol", score: 88}' } },
      { id: 'op', type: 'insert-row', params: { row: '{}' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'new_row', from_port: 'output', to: 'op', to_port: 'row' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'col-to-list': linear('const', { value: '[[name score]; [alice 90] [bob 75]]' }, 'col-to-list', { column: 'score' }),

  'col-stats': linear('const', { value: '[[price]; [10] [20] [15] [30] [25]]' }, 'col-stats', { column: 'price' }),

  summarize: linear(
    'const',
    { value: '[[price qty]; [10 2] [20 5] [15 3]]' },
    'summarize',
    { cols: 'price qty', ops: 'avg sum' }
  ),

  'null-fill': linear(
    'const',
    { value: '[[a b]; [1 null] [2 5] [3 null]]' },
    'null-fill',
    { column: 'b', op: 'const', value: '0' }
  ),

  'group-agg': {
    nodes: [
      constSrc('[[cat val]; [A 10] [A 30] [B 5] [B 15]]'),
      { id: 'grp', type: 'group-by', params: { column: 'cat' } },
      { id: 'agg', type: 'group-agg', params: { column: 'val', op: 'avg' } },
      ret(),
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
      { id: 'scores', type: 'const', params: { value: '[90, 75, 88]' } },
      { id: 'op', type: 'zip', params: { right: '[]', key_a: 'name', key_b: 'score' } },
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

  row: linear('const', { value: '[[name score]; [alice 80] [bob 60] [carol 95]]' }, 'row', { index: '1' }),

  'row-apply': linear(
    'const',
    { value: '[[name price qty]; [apple 1.5 3] [banana 0.8 5]]' },
    'row-apply',
    { expr: '$in.price * $in.qty', as_col: 'total' }
  ),

  'chunk-by': linear('const', { value: '[[val]; [1] [1] [2] [2] [1]]' }, 'chunk-by', { column: 'val' }),

  // ── Compute ────────────────────────────────────────────────────────────────

  math: {
    nodes: [
      constSrc('10'),
      { id: 'rhs', type: 'const', params: { value: '3' } },
      { id: 'op', type: 'math', params: { op: '+', operand: '0' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'rhs', from_port: 'output', to: 'op', to_port: 'operand' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'math-fn': linear('const', { value: '[4.7, 2.1, 8.9]' }, 'math-fn', { op: 'avg', column: '' }),

  'string-op': linear('const', { value: '"  hello world  "' }, 'string-op', { op: 'trim', arg: '' }),

  'type-cast': linear('const', { value: '"42"' }, 'type-cast', { target: 'int' }),

  each: linear('const', { value: '[1, 2, 3, 4]' }, 'each', { expr: '$in * $in' }),

  'str-concat': {
    nodes: [
      constSrc('"world"'),
      { id: 'pre', type: 'const', params: { value: '"Hello, "' } },
      { id: 'op', type: 'str-concat', params: { prefix: '', suffix: '!' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'pre', from_port: 'output', to: 'op', to_port: 'prefix' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'str-interp': linear('const', { value: '{name: "Alice", score: 95}' }, 'str-interp', { template: 'Player {name} scored {score} points!' }),

  'url-encode': linear('const', { value: '"hello world & more"' }, 'url-encode', {}),

  'url-decode': linear('const', { value: '"hello%20world%20%26%20more"' }, 'url-decode', {}),

  'to-string': linear('const', { value: '{a: 1, b: [2, 3]}' }, 'to-string', { format: 'json' }),

  'from-string': linear('const', { value: '"{\\"a\\": 1}"' }, 'from-string', { format: 'json' }),

  append: {
    nodes: [
      constSrc('[1, 2, 3]'),
      { id: 'extra', type: 'const', params: { value: '[4, 5]' } },
      { id: 'op', type: 'append', params: { items: '[]' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'extra', from_port: 'output', to: 'op', to_port: 'items' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'encode-base64': linear('const', { value: '"hello world"' }, 'encode-base64', {}),
  'decode-base64': linear('const', { value: '"aGVsbG8gd29ybGQ="' }, 'decode-base64', {}),
  'encode-hex': linear('const', { value: '"hello"' }, 'encode-hex', {}),
  'decode-hex': linear('const', { value: '"68656c6c6f"' }, 'decode-hex', {}),

  'into-duration': linear('const', { value: '"2hr"' }, 'into-duration', {}),
  'into-filesize': linear('const', { value: '"1024"' }, 'into-filesize', {}),

  // ── Datetime ───────────────────────────────────────────────────────────────

  'date-now': {
    nodes: [
      { id: 'src', type: 'date-now', params: {} },
      { id: 'fmt', type: 'date-format', params: { fmt: '%Y-%m-%d' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'fmt', to_port: 'input' },
      { id: 'e2', from: 'fmt', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'date-format': linear('const', { value: '2024-01-15T10:30:00+00:00' }, 'date-format', { fmt: '%Y-%m-%d' }),

  'into-datetime': linear('const', { value: '"2024-01-15"' }, 'into-datetime', { fmt: '%Y-%m-%d' }),

  'date-add': linear('const', { value: '2024-01-15T00:00:00+00:00' }, 'date-add', { amount: '7day' }),

  'to-timezone': linear('const', { value: '2024-01-15T00:00:00+00:00' }, 'to-timezone', { tz: 'America/New_York' }),

  'list-timezone': {
    nodes: [
      { id: 'src', type: 'list-timezone', params: {} },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Logic ──────────────────────────────────────────────────────────────────

  if: linear('const', { value: '42' }, 'if', { column: '', op: '>', value: '10', fallback: '0' }),

  for: {
    nodes: [
      { id: 'src', type: 'const', params: { value: '[1, 2, 3, 4, 5]' } },
      { id: 'op', type: 'for', params: { over: '$in', init: '0', expr: '$in.acc + $in.elem' } },
      { id: 'out', type: 'return', params: {} },
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  // ── Output ─────────────────────────────────────────────────────────────────

  return: linear('const', { value: '"the answer is 42"' }, 'return', {}),

  display: linear('const', { value: '42' }, 'display', {}),

  'to-json': linear('const', { value: '{a: 1, b: [2, 3]}' }, 'to-json', {}),
  'to-csv': linear('const', { value: '[[name age]; [alice 30] [bob 25]]' }, 'to-csv', {}),
  'to-nuon': linear('const', { value: '{a: 1}' }, 'to-nuon', {}),
  'to-text': linear('const', { value: '"hello world"' }, 'to-text', {}),

  'file-out': {
    nodes: [
      constSrc('[{a: 1}, {a: 2}]'),
      { id: 'op', type: 'file-out', params: { path: '/tmp/out.json', format: 'json' } },
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
    ],
  },

  // ── File ───────────────────────────────────────────────────────────────────

  ls: {
    nodes: [
      { id: 'src', type: 'ls', params: { path: '.' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'path-join': linear('const', { value: '"/usr/local"' }, 'path-join', { segment: 'bin' }),
  'path-parse': linear('const', { value: '"/usr/local/bin/node"' }, 'path-parse', {}),

  // ── External ───────────────────────────────────────────────────────────────

  'http-post': {
    nodes: [
      constSrc('{title: "test", body: "hello", userId: 1}'),
      { id: 'op', type: 'http-post', params: { url: 'https://jsonplaceholder.typicode.com/posts', content_type: 'application/json' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'http-put': {
    nodes: [
      constSrc('{title: "updated", body: "new content", userId: 1}'),
      { id: 'op', type: 'http-put', params: { url: 'https://jsonplaceholder.typicode.com/posts/1', content_type: 'application/json' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'http-patch': {
    nodes: [
      constSrc('{title: "patched title"}'),
      { id: 'op', type: 'http-patch', params: { url: 'https://jsonplaceholder.typicode.com/posts/1', content_type: 'application/json' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  'http-delete': {
    nodes: [
      { id: 'op', type: 'http-delete', params: { url: 'https://jsonplaceholder.typicode.com/posts/1' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'op', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'http-head': {
    nodes: [
      { id: 'op', type: 'http-head', params: { url: 'https://jsonplaceholder.typicode.com/posts/1' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'op', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  llm: {
    nodes: [
      constSrc('"What is 2 + 2? Answer in one word."'),
      { id: 'ctx', type: 'const', params: { value: '"You are a terse assistant."' } },
      { id: 'op', type: 'llm', params: { model: '', context: '' } },
      ret(),
    ],
    edges: [
      { id: 'e1', from: 'src', from_port: 'output', to: 'op', to_port: 'input' },
      { id: 'e2', from: 'ctx', from_port: 'output', to: 'op', to_port: 'context' },
      { id: 'e3', from: 'op', from_port: 'output', to: 'out', to_port: 'input' },
    ],
  },

  // ── Web ────────────────────────────────────────────────────────────────────

  'web-htmd': {
    nodes: [
      { id: 'src', type: 'web-htmd', params: { url: 'https://example.com', main: 'true' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── RSS ────────────────────────────────────────────────────────────────────

  'rss-feed': {
    nodes: [
      { id: 'src', type: 'rss-feed', params: { url: 'https://hnrss.org/frontpage' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Hacker News ────────────────────────────────────────────────────────────

  'hn-search': {
    nodes: [
      { id: 'src', type: 'hn-search', params: { query: 'rust programming', sort: 'relevance', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'hn-comments': {
    nodes: [
      { id: 'src', type: 'hn-comments', params: { query: 'ask hn: what are you working on', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Reddit ─────────────────────────────────────────────────────────────────

  'reddit-subreddit': {
    nodes: [
      { id: 'src', type: 'reddit-subreddit', params: { subreddit: 'programming', sort: 'hot', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'reddit-search': {
    nodes: [
      { id: 'src', type: 'reddit-search', params: { query: 'machine learning', sort: 'relevance', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'reddit-comments': {
    nodes: [
      { id: 'src', type: 'reddit-comments', params: { post_id: 'https://www.reddit.com/r/programming/comments/example/', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Wikipedia ──────────────────────────────────────────────────────────────

  'wiki-search': {
    nodes: [
      { id: 'src', type: 'wiki-search', params: { query: 'Rust programming language', limit: '5' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'wiki-summary': {
    nodes: [
      { id: 'src', type: 'wiki-summary', params: { title: 'Rust (programming language)' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'wiki-sections': {
    nodes: [
      { id: 'src', type: 'wiki-sections', params: { title: 'Rust (programming language)' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'wiki-section': {
    nodes: [
      { id: 'src', type: 'wiki-section', params: { title: 'Rust (programming language)', section: 'History' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'wiki-table': {
    nodes: [
      { id: 'src', type: 'wiki-table', params: { title: 'List of countries by GDP', index: '0' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── YouTube ────────────────────────────────────────────────────────────────

  'youtube-search': {
    nodes: [
      { id: 'src', type: 'youtube-search', params: { query: 'rust programming tutorial', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'youtube-video': {
    nodes: [
      { id: 'src', type: 'youtube-video', params: { id: 'dQw4w9WgXcQ' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'youtube-channel': {
    nodes: [
      { id: 'src', type: 'youtube-channel', params: { id: 'UCVjlpEjEY9GpksqbEesJnNA' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'youtube-playlist': {
    nodes: [
      { id: 'src', type: 'youtube-playlist', params: { id: 'PLbZIPy20-1pN5BRnGDToJGKmOfluqCBKT', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'youtube-transcript': {
    nodes: [
      { id: 'src', type: 'youtube-transcript', params: { video_id: 'dQw4w9WgXcQ' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── GitHub ─────────────────────────────────────────────────────────────────

  'github-repo': {
    nodes: [
      { id: 'src', type: 'github-repo', params: { owner: 'rust-lang', repo: 'rust' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'github-commits': {
    nodes: [
      { id: 'src', type: 'github-commits', params: { owner: 'rust-lang', repo: 'rust', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'github-contributors': {
    nodes: [
      { id: 'src', type: 'github-contributors', params: { owner: 'rust-lang', repo: 'rust', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Market ─────────────────────────────────────────────────────────────────

  'market-snapshot': {
    nodes: [
      { id: 'src', type: 'market-snapshot', params: { ticker: 'AAPL' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'market-history': {
    nodes: [
      { id: 'src', type: 'market-history', params: { ticker: 'AAPL', range: '1mo' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'market-screener': {
    nodes: [
      { id: 'src', type: 'market-screener', params: { filter: 'sector_Technology', limit: '20' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'market-options': {
    nodes: [
      { id: 'src', type: 'market-options', params: { ticker: 'AAPL' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'market-symbols': {
    nodes: [
      { id: 'src', type: 'market-symbols', params: { exchange: 'NASDAQ' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── CoinGecko ──────────────────────────────────────────────────────────────

  'coingecko-simple': {
    nodes: [
      { id: 'src', type: 'coingecko-simple', params: { ids: 'bitcoin,ethereum', vs: 'usd' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'coingecko-markets': {
    nodes: [
      { id: 'src', type: 'coingecko-markets', params: { currency: 'usd', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'coingecko-global': {
    nodes: [
      { id: 'src', type: 'coingecko-global', params: {} },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Fear & Greed ───────────────────────────────────────────────────────────

  'fear-greed-now': {
    nodes: [
      { id: 'src', type: 'fear-greed-now', params: {} },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'fear-greed-history': {
    nodes: [
      { id: 'src', type: 'fear-greed-history', params: { limit: '30' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── FRED ───────────────────────────────────────────────────────────────────

  'fred-series': {
    nodes: [
      { id: 'src', type: 'fred-series', params: { series_id: 'FEDFUNDS', limit: '24' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'fred-search': {
    nodes: [
      { id: 'src', type: 'fred-search', params: { query: 'unemployment rate', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── BLS ────────────────────────────────────────────────────────────────────

  'bls-series': {
    nodes: [
      { id: 'src', type: 'bls-series', params: { series_id: 'LNS14000000' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'bls-presets': {
    nodes: [
      { id: 'src', type: 'bls-presets', params: {} },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── SEC ────────────────────────────────────────────────────────────────────

  'sec-10k': {
    nodes: [
      { id: 'src', type: 'sec-10k', params: { ticker: 'AAPL', limit: '5' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'sec-10q': {
    nodes: [
      { id: 'src', type: 'sec-10q', params: { ticker: 'AAPL', limit: '5' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'sec-8k': {
    nodes: [
      { id: 'src', type: 'sec-8k', params: { ticker: 'AAPL', limit: '5' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'sec-earnings': {
    nodes: [
      { id: 'src', type: 'sec-earnings', params: { ticker: 'AAPL', limit: '8' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'sec-filing': {
    nodes: [
      { id: 'src', type: 'sec-filing', params: { accession: '0000320193-23-000106' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'sec-insider': {
    nodes: [
      { id: 'src', type: 'sec-insider', params: { ticker: 'AAPL', limit: '10' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'sec-proxy': {
    nodes: [
      { id: 'src', type: 'sec-proxy', params: { ticker: 'AAPL', limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── News (Phase 1) ──────────────────────────────────────────────────────────

  'bbc-feed': {
    nodes: [
      { id: 'src', type: 'bbc-feed', params: { limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'cnn-feed': {
    nodes: [
      { id: 'src', type: 'cnn-feed', params: { limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'aljazeera-feed': {
    nodes: [
      { id: 'src', type: 'aljazeera-feed', params: { limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Blog (Phase 1) ───────────────────────────────────────────────────────────

  'medium-feed': {
    nodes: [
      { id: 'src', type: 'medium-feed', params: { user: 'towards-data-science', limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'substack-feed': {
    nodes: [
      { id: 'src', type: 'substack-feed', params: { publication: 'example', limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  // ── Search (Phase 2) ─────────────────────────────────────────────────────────

  'arxiv-search': {
    nodes: [
      { id: 'src', type: 'arxiv-search', params: { query: 'machine learning', limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'google-scholar': {
    nodes: [
      { id: 'src', type: 'google-scholar', params: { query: 'reinforcement learning', limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

  'bbc-search': {
    nodes: [
      { id: 'src', type: 'bbc-search', params: { query: 'climate change', limit: '3' } },
      ret(),
    ],
    edges: [{ id: 'e1', from: 'src', from_port: 'output', to: 'out', to_port: 'input' }],
  },

}
