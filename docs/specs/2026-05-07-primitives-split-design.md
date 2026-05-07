# Primitives Split: Per-Node File Design

**Date:** 2026-05-07  
**Status:** Planned

## Problem

`primitives.nu` is a 1,339-line, 68-function monolith. Every agent edit of a single node requires parsing the entire file. With nodes being added over time, this compounds. The goal is Pure Data-style isolation: each node lives in its own `.nu` file, completely self-contained — implementation and metadata co-located.

---

## Design

### Node File Format

Each node is a single `.nu` file. Metadata is encoded natively:

- **`@category`** — native Nushell attribute, read from `scope commands` as `$cmd.category`
- **First doc comment line** — becomes `agent_hint` (the human/agent description)
- **Param annotations** in the `#` description of each param:

| Annotation | Meaning |
|---|---|
| `[wirable]` | Param accepts wired edges |
| `[required]` | Business-required (Nu named flags are always syntactically optional) |
| `[options:a,b,c]` | Enum values |
| `[format:nuon]` / `[format:plain]` | Param value format |

**Example — `primitives/input/fetch.nu`:**
```nu
# Fetch data from a URL via HTTP GET. --url is wirable — wire a string output to set dynamically.
@category input
export def "prim-fetch" [
    --url: string      # [wirable][required] URL to fetch
    --timeout: int = 30  # Request timeout in seconds
]: nothing -> any {
    # implementation verbatim from primitives.nu
}
```

**Example — `primitives/transform/filter.nu`:**
```nu
# Filter table rows by a column value. Supports ==, !=, >, <, contains comparisons.
@category transform
export def "prim-filter" [
    --column: string   # [required] Column name to filter on
    --op: string       # [required][options:==,!=,>,<,contains] Comparison operator
    --value: string    # [required][format:plain] Value to compare (plain string — no NUON quoting)
]: table -> table {
    # implementation
}
```

### Color

Color is now **category-derived** (not stored per-node). Frontend was removed so per-node color is unnecessary overhead. The introspect logic maps:

| Category | Color |
|---|---|
| input | `#f97316` |
| transform | `#3b82f6` |
| compute | `#eab308` |
| logic | `#ec4899` |
| output | `#22c55e` |
| external | `#a855f7` |
| file | `#f97316` |
| datetime | `#06b6d4` |

### Extension Backward Compatibility

Extensions (`extensions/*.nu`) keep their `*_PRIMITIVE_META` constants unchanged. The introspect logic falls back to ext_meta lookup for commands that don't have a `@category` attribute. No changes needed to extension files.

---

## File Layout

```
primitives/
  input/
    fetch.nu
    const.nu
    env.nu
    file-in.nu
  transform/
    filter.nu      map.nu         select.nu      sort.nu
    count.nu       first.nu       last.nu        rename.nu
    get.nu         merge.nu       reject.nu      update.nu
    group-by.nu    reduce.nu      uniq.nu        append.nu
    flatten.nu     reverse.nu     drop.nu        enumerate.nu
    wrap.nu        join.nu        table-concat.nu insert-row.nu
    col-to-list.nu col-stats.nu   summarize.nu   null-fill.nu
    group-agg.nu   transpose.nu   values.nu      columns.nu
    zip.nu         batch.nu       window.nu      items.nu
    find.nu        row.nu         move.nu        chunk-by.nu
    compact.nu
  compute/
    math.nu        string-op.nu   type-cast.nu   from-string.nu
    math-fn.nu     each.nu        str-concat.nu  str-interp.nu
    url-encode.nu  url-decode.nu  hash.nu
    encode-base64.nu decode-base64.nu
    encode-hex.nu  decode-hex.nu  row-apply.nu
    into-filesize.nu into-duration.nu
  logic/
    if.nu   match.nu   try.nu   catch.nu   for.nu   while.nu
  output/
    return.nu  display.nu  file-out.nu
    to-json.nu to-csv.nu   to-text.nu  to-nuon.nu
  external/
    llm.nu      analyze.nu   http-post.nu  http-put.nu
    http-delete.nu http-patch.nu http-head.nu
  file/
    ls.nu  rm.nu  mkdir.nu  glob.nu  path-parse.nu  path-join.nu
  datetime/
    date-now.nu  date-add.nu    to-timezone.nu  list-timezone.nu
    date-format.nu into-datetime.nu
```

Total: **68 files** across 8 category directories.

---

## Code Changes

### 1. `server/execute.ts` — `buildUseLines()`

**Current (lines 8–14):**
```ts
function buildUseLines(): string {
  const extDir = resolve(ROOT, 'extensions')
  const exts = existsSync(extDir)
    ? readdirSync(extDir).filter(f => f.endsWith('.nu')).map(f => `use extensions/${f} *`)
    : []
  return ['use primitives.nu *', ...exts].join('; ')
}
```

**New:**
```ts
function buildUseLines(): string {
  const primDir = resolve(ROOT, 'primitives')
  const primFiles = existsSync(primDir)
    ? (readdirSync(primDir, { recursive: true }) as string[])
        .filter(f => f.endsWith('.nu'))
        .map(f => `use primitives/${f} *`)
    : ['use primitives.nu *']  // fallback if directory doesn't exist yet
  const extDir = resolve(ROOT, 'extensions')
  const extFiles = existsSync(extDir)
    ? readdirSync(extDir).filter(f => f.endsWith('.nu')).map(f => `use extensions/${f} *`)
    : []
  return [...primFiles, ...extFiles].join('; ')
}
```

### 2. `server/spec.ts` — `loadSpec()` + `INTROSPECT_LOGIC`

**File discovery** (same recursive scan as above, replacing the `use primitives.nu *` line).

**`INTROSPECT_LOGIC`** changes:

Remove:
```nu
let core_meta = $PRIMITIVE_META
let ext_meta = (scope variables | where name =~ '_PRIMITIVE_META$' | where name != 'PRIMITIVE_META' ...)
let all_meta = ($core_meta | merge $ext_meta)
```

Replace with:
```nu
# Extension fallback — commands without @category use *_PRIMITIVE_META if available
let ext_meta = (
    scope variables
    | where name =~ '_PRIMITIVE_META$'
    | each {|v| $v.value}
    | reduce --fold {} {|it, acc| $acc | merge $it}
)

let category_colors = {
    input: "#f97316", transform: "#3b82f6", compute: "#eab308",
    logic: "#ec4899", output: "#22c55e", external: "#a855f7",
    file: "#f97316", datetime: "#06b6d4"
}
```

**Per-command metadata resolution** (replaces `$all_meta | get -o $short_name` lookup):
```nu
let short_name = ($cmd.name | str replace 'prim-' '' | str replace --all '-' '_')
let ext_m = ($ext_meta | get -o $short_name)

let category = if ($cmd.category | is-not-empty) {
    $cmd.category                                     # native @category (new nodes)
} else if $ext_m != null {
    ($ext_m | get -o category | default 'other')      # extension fallback
} else { 'other' }

let color = ($category_colors | get -o $category | default "#6b7280")
let agent_hint = ($cmd.description | default '')
```

**Param annotation parsing** (replaces `$param_opts`, `$wirable_list`, etc. from all_meta):
```nu
let params = ($sig_rows
    | where parameter_type == 'named'
    | where parameter_name != 'help'
    | each {|p|
        let desc = ($p.description | default '')
        let wirable  = ($desc | str contains '[wirable]')
        let required = ($desc | str contains '[required]') or (not $p.is_optional)
        let opts_m   = ($desc | parse --regex '\[options:(?P<o>[^\]]+)\]')
        let options  = if ($opts_m | is-empty) { null } else { $opts_m | first | get o | split row ',' }
        let fmt_m    = ($desc | parse --regex '\[format:(?P<f>[^\]]+)\]')
        let fmt      = if ($fmt_m | is-empty) { null } else { $fmt_m | first | get f }
        # For extensions still using ext_meta, merge their param_options/wirable as fallback
        let ext_opts = ($ext_m | get -o param_options | default {} | get -o $p.parameter_name)
        let ext_wire = ($ext_m | get -o wirable | default [] | any {|w| $w == $p.parameter_name})
        let final_opts = if $options != null { $options } else if $ext_opts != null { $ext_opts } else { null }
        let final_wire = $wirable or $ext_wire
        let clean_desc = ($desc | str replace --all --regex '\[[^\]]*\]' '' | str trim)
        let base = { name: $p.parameter_name, type: ($p.syntax_shape | default 'string'),
                     required: $required, wirable: $final_wire, description: $clean_desc }
        let base = if $final_opts != null { $base | insert options $final_opts } else { $base }
        if $fmt != null { $base | insert format $fmt } else { $base }
    })
```

### 3. `scripts/introspect.nu`

Replace `use ../primitives.nu *` with individual `use` statements for each primitive file (or note that `spec.ts` is the authoritative introspect driver).

### 4. Delete `primitives.nu`

After all tests pass.

---

## Verification

```bash
# 1. Server starts and loads all nodes
bun run server/index.ts

# 2. Node count unchanged (expect 140+)
curl http://localhost:3001/catalog | jq '. | length'

# 3. All spec fields present on a node
curl http://localhost:3001/defs/filter | jq '{category, color, agent_hint, wirable_params}'

# 4. Wirable annotation parsed correctly
curl http://localhost:3001/defs/filter | jq '.params[] | {name, wirable, required, options}'

# 5. Extension backward compat
curl http://localhost:3001/defs/bls-series | jq '{category, agent_hint, wirable_params}'

# 6. Full test suite
bun test  # expect 191 pass
```

---

## Migration Order

1. Update `buildUseLines()` in `execute.ts` (with `primitives.nu` fallback so nothing breaks yet)
2. Update `INTROSPECT_LOGIC` and `loadSpec()` in `spec.ts`
3. Create `primitives/` directory structure and split 68 nodes
4. Verify catalog/defs still correct
5. Run full test suite
6. Delete `primitives.nu`
7. Update `scripts/introspect.nu`
