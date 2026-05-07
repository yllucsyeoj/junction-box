#!/usr/bin/env bun
/**
 * Split primitives.nu into per-node files under primitives/<category>/<name>.nu
 * Adds @category attribute and param annotations from PRIMITIVE_META data.
 * Run from project root: bun scripts/split-primitives.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const ROOT = resolve(import.meta.dir, '..')

interface NodeMeta {
  category: string
  agent_hint: string
  wirable?: string[]
  required_params?: string[]
  param_options?: Record<string, string[]>
  param_formats?: Record<string, string>
}

// Hardcoded from PRIMITIVE_META in primitives.nu (lines 6-129)
// Keys use underscores (PRIMITIVE_META format); filenames use hyphens
const META: Record<string, NodeMeta> = {
  fetch:         { category: 'input',     wirable: ['url'], required_params: ['url'], agent_hint: 'Fetch JSON/table data from a URL via HTTP GET. --url is wirable — wire a string output to set it dynamically.' },
  const:         { category: 'input',     agent_hint: 'Provide a fixed NUON constant value (e.g. 42, "hello", [1 2 3])', param_formats: { value: 'nuon' } },
  env:           { category: 'input',     agent_hint: 'Read an environment variable by name, returns its string value' },
  file_in:       { category: 'input',     agent_hint: 'Read a file — auto-detects CSV/JSON/NUON, else returns raw string' },
  ls:            { category: 'file',      agent_hint: 'List directory contents as a table (name, type, size, modified)' },
  rm:            { category: 'file',      agent_hint: 'Remove a file at the given path' },
  mkdir:         { category: 'file',      agent_hint: 'Create a directory (and parents) at the given path' },
  glob:          { category: 'file',      agent_hint: 'Find files matching a glob pattern (e.g. **/*.json)' },
  path_parse:    { category: 'file',      agent_hint: 'Parse a file path into its components (dir, stem, extension)' },
  path_join:     { category: 'file',      agent_hint: 'Join path components into a full path' },
  date_now:      { category: 'datetime',  agent_hint: 'Return the current date and time as a datetime value' },
  date_add:      { category: 'datetime',  agent_hint: 'Add a duration to a datetime. amount examples: 1day, 2hr, 30min, -7day' },
  to_timezone:   { category: 'datetime',  agent_hint: 'Convert datetime to a different timezone' },
  list_timezone: { category: 'datetime',  agent_hint: 'List available timezone names' },
  date_format:   { category: 'datetime',  agent_hint: 'Format a datetime as a string using a strftime pattern (default: %Y-%m-%d %H:%M:%S)' },
  into_datetime: { category: 'datetime',  agent_hint: 'Parse a string into a datetime value — optionally provide a --fmt strftime pattern' },
  into_filesize: { category: 'compute',   agent_hint: 'Convert a string like 5MB into a filesize value' },
  into_duration: { category: 'compute',   agent_hint: 'Convert a string like 1hr 30min into a duration value' },
  hash:          { category: 'compute',   agent_hint: 'Compute hash of a string: md5, sha256', param_options: { algo: ['md5', 'sha256'] } },
  encode_base64: { category: 'compute',   agent_hint: 'Encode a string to base64' },
  decode_base64: { category: 'compute',   agent_hint: 'Decode a base64 string to plain text' },
  encode_hex:    { category: 'compute',   agent_hint: 'Encode a string to hex' },
  decode_hex:    { category: 'compute',   agent_hint: 'Decode a hex string to plain text' },
  math:          { category: 'compute',   wirable: ['operand'], agent_hint: 'Apply a math operation (+, -, *, /) to a number. Wire a number to --operand for multi-input.', param_options: { op: ['+', '-', '*', '/'] } },
  string_op:     { category: 'compute',   agent_hint: 'Apply a string operation: upcase, downcase, trim, length, split, replace, starts-with, ends-with, contains, substring (arg: old:new)', param_options: { op: ['upcase', 'downcase', 'trim', 'length', 'split', 'replace', 'starts-with', 'ends-with', 'contains', 'substring'] } },
  type_cast:     { category: 'compute',   agent_hint: 'Cast a value to a target type: int, float, string, bool', param_options: { target: ['int', 'float', 'string', 'bool'] } },
  math_fn:       { category: 'compute',   agent_hint: 'Apply a math function: round/floor/ceil/abs on a number, or sum/min/max/avg/sqrt/median/stddev on a list or table column', param_options: { op: ['round', 'floor', 'ceil', 'abs', 'sum', 'min', 'max', 'avg', 'sqrt', 'median', 'stddev'] } },
  each:          { category: 'compute',   agent_hint: 'Apply a Nu expression to every element of a list or table row. Use $in for the element/row. e.g. $in * 2 (list) or $in.score * 2 (table).' },
  str_concat:    { category: 'compute',   wirable: ['prefix', 'suffix'], agent_hint: 'Concatenate strings: prepend --prefix and/or append --suffix. Both ports are wirable. Param values are plain strings — whitespace is preserved.' },
  str_interp:    { category: 'compute',   agent_hint: 'Template string interpolation — input must be a record; use {field} placeholders in --template' },
  url_encode:    { category: 'compute',   agent_hint: 'Percent-encode a string for safe use in a URL' },
  url_decode:    { category: 'compute',   agent_hint: 'Decode a percent-encoded URL string' },
  from_string:   { category: 'compute',   agent_hint: 'Parse a string as JSON, NUON, CSV, TOML, or YAML into a value', param_options: { format: ['json', 'nuon', 'csv', 'toml', 'yaml'] } },
  row_apply:     { category: 'compute',   agent_hint: "Apply a Nu expression to each table row ($in = row record). --as_col adds result as new column; omit to replace the row. IMPORTANT: when using --as_col, the expression must return a scalar (string/number/bool) — returning the whole row record creates a nested column that breaks downstream filter comparisons." },
  filter:        { category: 'transform', agent_hint: 'Filter table rows: pick column, op (>, <, ==, !=, contains), and value (plain string — no NUON quoting needed). Column must be a top-level name — dotted paths like address.city are not supported.', param_formats: { value: 'plain' }, param_options: { op: ['==', '!=', '>', '<', 'contains'] } },
  map:           { category: 'transform', agent_hint: 'Add or replace a column with a NUON constant value', param_formats: { value: 'nuon' } },
  select:        { category: 'transform', agent_hint: 'Keep only the named columns from a table (comma- or space-separated, e.g. "name,email,phone")' },
  sort:          { category: 'transform', agent_hint: 'Sort a table by a column. direction: asc or desc', param_options: { direction: ['asc', 'desc'] } },
  count:         { category: 'transform', agent_hint: 'Count the number of rows in a table' },
  first:         { category: 'transform', agent_hint: "Return the first N rows of a table (default N=1). Returns a table — use 'get' to extract a field from the result." },
  last:          { category: 'transform', agent_hint: 'Return the last N rows of a table (default N=1).' },
  rename:        { category: 'transform', agent_hint: 'Rename a column: provide old and new column name' },
  get:           { category: 'transform', agent_hint: 'Get a field from a record or an index from a list' },
  merge:         { category: 'transform', wirable: ['with'], agent_hint: 'Merge a NUON record into the input record — overlapping keys overwritten. Wire a record to --with for multi-input.', param_formats: { with: 'nuon' } },
  reject:        { category: 'transform', agent_hint: 'Remove named columns from a table or record (comma- or space-separated)' },
  update:        { category: 'transform', agent_hint: 'Update a field in a record/table with a NUON value', param_formats: { value: 'nuon' } },
  group_by:      { category: 'transform', agent_hint: 'Group table rows by a column — returns a record keyed by the column values' },
  reduce:        { category: 'transform', agent_hint: 'Reduce a list to a single value: sum, product, min, max, avg, or join', param_options: { op: ['sum', 'product', 'min', 'max', 'avg', 'join'] } },
  uniq:          { category: 'transform', agent_hint: 'Return unique values from a list (deduplicate)' },
  append:        { category: 'transform', wirable: ['items'], agent_hint: 'Append to a list. Wire a second list/value to --items for multi-input.', param_formats: { items: 'nuon' } },
  flatten:       { category: 'transform', agent_hint: 'Flatten one level of nesting from a list of lists' },
  reverse:       { category: 'transform', agent_hint: 'Reverse a list or table' },
  drop:          { category: 'transform', agent_hint: 'Skip the first N rows/elements from a list or table' },
  enumerate:     { category: 'transform', agent_hint: 'Add a zero-based index field to each element — returns [{index, value}, ...]' },
  wrap:          { category: 'transform', agent_hint: 'Wrap a single value into a one-element list' },
  join:          { category: 'transform', wirable: ['right'], agent_hint: 'SQL-style join two tables on a shared column. Wire second table to --right port.', param_formats: { right: 'nuon' }, param_options: { type: ['inner', 'left'] } },
  table_concat:  { category: 'transform', wirable: ['more'], agent_hint: 'Vertically stack two tables (UNION ALL). Wire the second table to --more port.', param_formats: { more: 'nuon' } },
  insert_row:    { category: 'transform', wirable: ['row'], agent_hint: 'Append a record as a new row to a table. Wire a record source to --row port.', param_formats: { row: 'nuon' } },
  col_to_list:   { category: 'transform', agent_hint: 'Extract a single column from a table as a flat list.' },
  col_stats:     { category: 'transform', agent_hint: 'Compute count/sum/avg/min/max for a numeric column. Returns a record.' },
  summarize:     { category: 'transform', agent_hint: "Single-operation aggregate: --col 'price' --op 'sum'. Returns a record of col_op keys. To get multiple aggregations, chain separate summarize nodes — one op per node.", param_options: { ops: ['avg', 'sum', 'min', 'max', 'count'] } },
  null_fill:     { category: 'transform', agent_hint: 'Fill null values in a table column with a NUON constant or forward-fill.', param_formats: { value: 'nuon' }, param_options: { op: ['const', 'ffill'] } },
  group_agg:     { category: 'transform', agent_hint: 'Aggregate a group_by record into a [{group, value}] summary table.', param_options: { op: ['avg', 'sum', 'min', 'max', 'count', 'first'] } },
  transpose:     { category: 'transform', agent_hint: 'Transpose a table (rows become columns) or convert a record to a [{column, value}] table.' },
  values:        { category: 'transform', agent_hint: 'Extract the values of a record as a list (complement to columns).' },
  columns:       { category: 'transform', agent_hint: 'Extract the column names of a table or record as a list.' },
  zip:           { category: 'transform', wirable: ['right'], agent_hint: 'Zip two parallel lists into a table of records. Wire second list to --right port. --key_a / --key_b name the fields.', param_formats: { right: 'nuon' } },
  batch:         { category: 'transform', agent_hint: 'Split a list into chunks of --size elements. Returns a list of lists.' },
  window:        { category: 'transform', agent_hint: 'Rolling N-row window aggregate over a table column. Adds a rolling result column.', param_options: { op: ['avg', 'sum', 'min', 'max'] } },
  items:         { category: 'transform', agent_hint: 'Convert a record to a [{key, value}] table — complement to columns.' },
  find:          { category: 'transform', agent_hint: 'Find the index of the first list element matching a condition ($in = element).' },
  row:           { category: 'transform', agent_hint: 'Get a row at a specific index from a table.' },
  move:          { category: 'transform', agent_hint: 'Move a column to a new position in a table. Use --before to insert before another column.' },
  chunk_by:      { category: 'transform', agent_hint: 'Group consecutive list elements by a predicate — splits when value changes.' },
  compact:       { category: 'transform', agent_hint: 'Remove null values from a list or table' },
  if:            { category: 'logic',     agent_hint: "Conditional gate: passes input through unchanged when the condition is true; returns --fallback (NUON) when false. Define the condition with --op (==, !=, >, <, is-empty, is-not-empty) and --value (comparison string). Use --column to test a specific field; omit to test the whole input. There is no 'then' expression — add downstream nodes to transform the true-branch value.", param_options: { op: ['==', '!=', '>', '<', 'is-empty', 'is-not-empty'] }, param_formats: { value: 'plain', fallback: 'nuon' } },
  match:         { category: 'logic',     agent_hint: 'Multi-way conditional: match a value against patterns. Patterns separated by spaces, each pattern:result pair colon-delimited.' },
  try:           { category: 'logic',     agent_hint: 'Try an expression, return fallback NUON on error.' },
  catch:         { category: 'logic',     agent_hint: 'Catch errors and handle them with a handler expression.' },
  for:           { category: 'logic',     agent_hint: 'Iterate over a list with an accumulator. In --expr: $in.elem is the current item, $in.acc is the running accumulator (seeded by --init). Returns the final accumulator.' },
  while:         { category: 'logic',     agent_hint: 'While loop with condition and body expressions. --max-iter prevents infinite loops.' },
  display:       { category: 'output',    agent_hint: 'Display the value (writes to stderr) and pass it through — safe to use mid-pipeline.' },
  file_out:      { category: 'output',    agent_hint: 'Write the value to a file. format: json, csv, text, or nuon', param_options: { format: ['json', 'csv', 'text', 'nuon'] } },
  return:        { category: 'output',    agent_hint: 'Return the pipeline result as the final output (pass-through terminal node)' },
  to_json:       { category: 'output',    agent_hint: 'Serialize any value to a JSON string' },
  to_csv:        { category: 'output',    agent_hint: 'Serialize a table to a CSV string' },
  to_text:       { category: 'output',    agent_hint: 'Convert any value to a plain text string (into string)' },
  to_nuon:       { category: 'output',    agent_hint: "Serialize any value to a NUON string (Nu's native format)" },
  llm:           { category: 'external',  wirable: ['context'], agent_hint: 'Call an LLM. Config via server env: LLM_ENDPOINT (empty=Anthropic cloud, set for OpenAI-compatible/local), LLM_API_KEY, LLM_MODEL (default model ID — node param overrides when set). The context param is sent as a system prompt (not prepended to user message, so it is not echoed back).' },
  analyze:       { category: 'external',  agent_hint: 'Send a table to an LLM for analysis. Formats rows as numbered items [1]..[N] so the model can cite sources by number. --fields selects which columns to include (comma-sep; default: all except noise cols). --prompt sets the task. Returns a string.' },
  http_post:     { category: 'external',  agent_hint: 'HTTP POST request — pipe body in, get response back' },
  http_put:      { category: 'external',  agent_hint: 'HTTP PUT request — pipe body in, get response back' },
  http_delete:   { category: 'external',  agent_hint: 'HTTP DELETE request' },
  http_patch:    { category: 'external',  agent_hint: 'HTTP PATCH request — pipe body in, get response back' },
  http_head:     { category: 'external',  agent_hint: 'HTTP HEAD request — returns headers only' },
}

/**
 * Extract all prim-* function definitions from primitives.nu source.
 * Returns a map of node-name (without "prim-" prefix, with hyphens) → full definition text.
 *
 * Uses two heuristics that are reliable for this codebase:
 * 1. One-liner functions: the `export def` line itself ends with `}`.
 * 2. Multi-line functions: collect lines until a bare `}` at column 0 (function terminator).
 *
 * This avoids naive brace counting, which fails when `{`/`}` appear inside
 * string literals or comment text (e.g. `# '{'.` or `"Hello {name}!"`).
 */
function extractFunctions(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = source.split('\n')

  let i = 0
  while (i < lines.length) {
    const exportMatch = lines[i].match(/^export def "prim-([^"]+)"/)
    if (!exportMatch) { i++; continue }

    const primName = exportMatch[1]  // e.g. "file-in", "group-by"
    const firstLine = lines[i]

    if (firstLine.trimEnd().endsWith('}')) {
      // One-liner: entire function on one line
      result[primName] = firstLine
      i++
    } else {
      // Multi-line: collect until a lone `}` at column 0 (function terminator)
      const funcLines: string[] = []
      let j = i
      while (j < lines.length) {
        funcLines.push(lines[j])
        if (j > i && lines[j] === '}') break
        j++
      }
      result[primName] = funcLines.join('\n')
      i = j + 1
    }
  }
  return result
}

/**
 * Inject param annotations into a function definition string.
 * Finds param lines (--paramname: type...  # description) and prepends tags.
 */
function injectAnnotations(funcDef: string, meta: NodeMeta): string {
  return funcDef.replace(
    /^([ \t]+--([a-z_]+)[^#]*#\s*)(.*)$/gm,
    (_, prefix, paramName, desc) => {
      const tags: string[] = []
      if (meta.wirable?.includes(paramName)) tags.push('[wirable]')
      if (meta.required_params?.includes(paramName)) tags.push('[required]')

      const options = meta.param_options?.[paramName]
      if (options && options.length > 0) tags.push(`[options:${options.join(',')}]`)

      const fmt = meta.param_formats?.[paramName]
      if (fmt) tags.push(`[format:${fmt}]`)

      if (tags.length === 0) return `${prefix}${desc}`
      return `${prefix}${tags.join('')} ${desc.trim()}`
    }
  )
}

/**
 * Generate the full content for a per-node .nu file.
 */
function buildNodeFile(funcDef: string, meta: NodeMeta): string {
  const withAnnotations = injectAnnotations(funcDef, meta)
  return `# ${meta.agent_hint}\n@category ${meta.category}\n${withAnnotations}\n`
}

// ── Main ──────────────────────────────────────────────────────────────────────

const src = readFileSync(resolve(ROOT, 'primitives.nu'), 'utf8')
const functions = extractFunctions(src)

let created = 0
let skipped = 0

for (const [metaKey, meta] of Object.entries(META)) {
  // PRIMITIVE_META keys use underscores; prim- names use hyphens
  const primName = metaKey.replace(/_/g, '-')

  const funcDef = functions[primName]
  if (!funcDef) {
    console.warn(`⚠ No function found for prim-${primName}`)
    skipped++
    continue
  }

  const relPath = `primitives/${meta.category}/${primName}.nu`
  const outPath = resolve(ROOT, relPath)

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, buildNodeFile(funcDef, meta))
  console.log(`✓ ${relPath}`)
  created++
}

console.log(`\nDone: ${created} files created, ${skipped} skipped`)
