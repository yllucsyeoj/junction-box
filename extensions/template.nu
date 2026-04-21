# GoNude extension template
# ─────────────────────────────────────────────────────────────────────────────
# Copy this file to extensions/yourname.nu and fill in each section.
# The server auto-discovers all *.nu files in extensions/ at startup — no
# registration needed. Restart the server after adding or editing extensions.
#
# Naming rules:
#   META key    → lower_snake_case, must be unique across ALL extensions
#   prim name   → "prim-{ext}-{node}" using kebab-case  (e.g. prim-weather-current)
#   META export → {EXT}_PRIMITIVE_META  (e.g. WEATHER_PRIMITIVE_META)
#   Helpers     → plain `def` (not exported), prefixed to avoid collisions
#
# One file = one domain. Don't mix unrelated APIs in the same extension.
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. Metadata ───────────────────────────────────────────────────────────────
# Every node MUST have all six fields. Missing fields cause the spec loader
# to fall back to defaults and the canvas/defs endpoint will be incomplete.
#
# category     — groups nodes visually on the canvas; pick a short label
# color        — hex colour for the node card (keep consistent per extension)
# wirable      — list of param names that accept live edge connections.
#                Empty list [] if no params support multi-input wiring.
#                Only params whose value comes from another node's output
#                should be listed — never list config-only params here.
# agent_hint   — one sentence for models: what it does + what it returns.
#                Include output shape (record / table / string / number).
# param_options — record of {param_name: [valid_values]} for enum params.
#                 Leave {} for params that are free-form strings/numbers.

export const TEMPLATE_PRIMITIVE_META = {

    # Input node: produces data from nothing (no pipeline input)
    template_source: {
        category: "template"
        color: "#f59e0b"
        wirable: []
        agent_hint: "Fetch a record of example data. Returns a record with 'id' and 'value' fields."
        param_options: {}
    }

    # Transform node: takes pipeline input, returns transformed output
    template_transform: {
        category: "template"
        color: "#f59e0b"
        wirable: []
        agent_hint: "Multiply a number by --factor. Input: number. Returns: number."
        param_options: {}
    }

    # Multi-input node: main data on 'input', second source wired to a param port
    # Wire an edge to --overlay to dynamically supply the merge record.
    template_multi: {
        category: "template"
        color: "#f59e0b"
        wirable: ["overlay"]   # ← "overlay" param accepts a live edge
        agent_hint: "Merge an overlay record into the input record. Wire a record source to --overlay for multi-input."
        param_options: {}
    }

    # External node: calls an API, returns structured data
    template_api: {
        category: "template"
        color: "#f59e0b"
        wirable: []
        agent_hint: "Fetch a JSON placeholder post by --id. Returns a record with userId, title, body."
        param_options: {}
    }

}

# ── 2. Private helpers ────────────────────────────────────────────────────────
# Use plain `def` (not `export def`) for helpers shared across your nodes.
# Prefix with your extension name to avoid collisions with other extensions.

def tmpl_double [n: number]: nothing -> number {
    $n * 2
}

def tmpl_shorten [s: string, max: int]: nothing -> string {
    if ($s | str length) > $max {
        ($s | str substring 0..$max) + "…"
    } else {
        $s
    }
}

# ── 3. Input node ─────────────────────────────────────────────────────────────
# Input type: nothing  (no pipeline input — this node originates data)
# Output type: record
#
# Rules:
#   - Signature must be:  [--params]: nothing -> <output_type>
#   - All params have defaults so the node works with zero config
#   - Avoid side effects (writes, deletes) unless the node name makes it obvious

# Produce a fixed example data record
export def "prim-template-source" [
    --id: string = "1"    # Record ID to return (1–5)
]: nothing -> record {
    let examples = [
        {id: 1, value: 10.0, label: "alpha"}
        {id: 2, value: 20.0, label: "beta"}
        {id: 3, value: 30.0, label: "gamma"}
        {id: 4, value: 40.0, label: "delta"}
        {id: 5, value: 50.0, label: "epsilon"}
    ]
    $examples | where id == ($id | into int) | first
}

# ── 4. Transform node ─────────────────────────────────────────────────────────
# Input type: number  (receives a value from the upstream node via pipeline)
# Output type: number
#
# Rules:
#   - Signature must be:  [--params]: <input_type> -> <output_type>
#   - Use $in to access the pipeline value
#   - Return a value that downstream nodes can consume

# Multiply a number by a factor
export def "prim-template-transform" [
    --factor: string = "2"    # Multiplication factor (parsed as float)
]: number -> number {
    $in * ($factor | into float)
}

# ── 5. Multi-input node ───────────────────────────────────────────────────────
# Accepts a second data source via a wirable param (the --overlay flag).
#
# How the wiring works:
#   - The primary data flows in as $in via the "input" edge as normal
#   - A second node's output can be wired to the "overlay" port in the graph:
#       {from: "other_node", from_port: "output", to: "this_node", to_port: "overlay"}
#   - The executor injects the wired value via env var → Nu reads it as NUON
#   - The default value ("{}") is used when nothing is wired to that port
#
# The param default must be a valid NUON string for the expected type:
#   record  → "{}"
#   list    → "[]"
#   number  → "0"
#   string  → ""

# Merge an overlay record into the input record (wirable multi-input example)
export def "prim-template-multi" [
    --overlay: string = "{}"    # NUON record to merge in — wire an edge to this port for multi-input
]: record -> record {
    let extra = ($overlay | from nuon)
    $in | merge $extra
}

# ── 6. External / API node ────────────────────────────────────────────────────
# Calls an external HTTP API. Input type: nothing (it fetches fresh data).
#
# Rules:
#   - Always set a User-Agent header — many APIs reject requests without one
#   - Wrap individual field accesses in `try { } catch { null }` for resilience
#   - Return a clean, flat record or table — don't return raw API responses

# Fetch a JSON placeholder post by ID (example external API node)
export def "prim-template-api" [
    --id: string = "1"    # Post ID (1–100)
]: nothing -> record {
    let raw = (http get
        -H {User-Agent: "junction-box-extension/1.0"}
        $"https://jsonplaceholder.typicode.com/posts/($id | into int)")
    {
        id:      $raw.id
        user_id: $raw.userId
        title:   (tmpl_shorten $raw.title 60)
        body:    (tmpl_shorten $raw.body 200)
    }
}

# ── Extension checklist ───────────────────────────────────────────────────────
# Before shipping an extension, verify:
#
#   nu -c "use extensions/yourname.nu *; echo ok"
#     → Must print "ok" with no errors
#
#   nu -c "use extensions/yourname.nu *; $YOUR_PRIMITIVE_META | columns"
#     → Must list all your node names
#
#   nu -c "use extensions/yourname.nu *; $YOUR_PRIMITIVE_META | items {|k,v| if not ('wirable' in $v) {$k}} | compact"
#     → Must be empty [] (all entries have wirable)
#
#   curl http://localhost:3001/defs | jq '[.[] | select(.category == "yourname")] | length'
#     → Must match the number of nodes in your META
#
#   # Smoke-test each node:
#   nu -c "use extensions/yourname.nu *; prim-yourname-source --id '1'"
