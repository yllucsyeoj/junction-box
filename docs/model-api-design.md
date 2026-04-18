# GoNude — Model API Design

**Vision**: A compressed language of composable primitives for data pipeline automation.
A model like Claude can build, execute, store and reuse data pipelines faster than
writing procedural code — because every building block is pre-made, type-safe, and
error-bounded. A non-coding user can audit exactly what was built.

---

## The Core Loop (model perspective)

```
GET  /defs              → bootstrap: learn what nodes exist, their types, wirable ports, examples
POST /exec              → send a NUON patch, get a JSON result back
POST /patch             → store a patch with an alias ("save this as a reusable function")
GET  /patch/:alias      → retrieve a stored patch
POST /exec              → call a stored patch by alias: {"alias": "get-aapl-price"}
```

A model needs **only these five interactions** to:
- Discover what is available
- Build a pipeline
- Execute it
- Store the result as a named API
- Compose stored patches into larger pipelines

---

## Why NUON Patches Beat Free-Form Code

| Aspect | Code | NUON Patch |
|---|---|---|
| Error surface | Unbounded | Bounded by primitive set |
| Multi-source composition | Requires orchestration | First-class (fan-in/fan-out edges) |
| Auditability | Read the code | Read the graph |
| Reusability | Manual refactor | `POST /patch` → call by alias |
| Model search space | Entire language | ~64 known node types |

**Sweet spot**: 4–20 node pipelines with multi-source data, transformations, and an output.
Single-step operations are fine as one-liners; complex branching logic needing custom closures
should fall back to embedded `each` / `row_apply` expressions.

---

## Node Type Contract

Every node in the system has a fixed contract:

```
input_type    what the main "input" port accepts (table | list | record | string | number | datetime | any | nothing)
output_type   what the node emits downstream
params        named flags — some accept static values, some accept live edge wiring
wirable       subset of params that can be connected by an edge (multi-input nodes)
```

**Multi-input wiring pattern** (the most important thing a model must understand):

A node that accepts multiple data sources does so via `wirable` params. Wire an edge to that
param port instead of (or in addition to) the main `input` port.

```nuon
# join: left table flows via "input", right table wired to "right" param port
{id: "j", type: "join", params: {on: "ticker", type: "inner"}}
{id: "e2", from: "prices", from_port: "output", to: "j", to_port: "right"}
```

Nodes with no wirable params only accept data on the `input` port.

---

## API Endpoints

### `GET /defs`
Full catalogue of all primitives (core + extensions). Returns array of `NodeDef`.

### `GET /defs/:type`
Single node definition. Returns `NodeDef` or 404.

```typescript
interface NodeDef {
  type: string            // e.g. "join"
  category: string        // input | transform | compute | external | datetime | logic | file
  color: string
  agent_hint: string      // one-line description for model context
  input_type: string      // main input port type
  output_type: string     // output type
  params: ParamDef[]
  example: Graph | null   // minimal working example graph
}

interface ParamDef {
  name: string
  type: string
  required: boolean
  wirable: boolean        // true = can accept a live edge connection
  options?: string[]      // valid enum values if constrained
  description: string
}
```

### `POST /exec`
Execute a pipeline synchronously.

**Accepts (three forms):**
```
Content-Type: text/plain         → raw NUON graph file
Content-Type: application/json  → parsed Graph object  
Body: {"alias": "my-patch"}     → run a stored patch by name
```

**Returns (success):**
```json
{
  "status": "complete",
  "result": "<nuon string>",
  "outputs": { "nodeId": "<nuon string>" }
}
```

**Returns (error — structured for model consumption):**
```json
{
  "status": "error",
  "fatal": null,
  "validation_errors": [
    {
      "node_id": "div",
      "type": "math",
      "error_type": "unknown_type",
      "message": "Node type 'maths' does not exist. Did you mean 'math'?",
      "suggestion": "Check /defs for valid node types."
    }
  ],
  "errors": {
    "div": {
      "message": "param 'operand' received string but expected number",
      "error_type": "runtime",
      "suggestion": "Add a type_cast node before wiring into operand"
    }
  },
  "skipped": ["out"],
  "outputs": {}
}
```

### `POST /patch`
Store a patch with an alias for later reuse.

```json
{
  "alias": "get-aapl-price",
  "description": "Fetches AAPL current price from Yahoo Finance",
  "graph": { "nodes": [...], "edges": [...] }
}
```

Returns `{ "ok": true, "alias": "get-aapl-price" }`.

### `GET /patch/:alias`
Retrieve a stored patch.

Returns `{ "alias": "...", "description": "...", "graph": {...}, "created_at": "..." }`.

### `GET /patches`
List all stored patches (alias, description, created_at).

---

## Pre-Execution Validation

Before any Nu subprocess is spawned, the executor runs a structural validation pass.
This catches the majority of model mistakes immediately with actionable messages.

Checks performed:
1. Every `node.type` exists in the registered primitives
2. Every edge `to_port` is either `"input"` or a known wirable param on that node type
3. Every edge references nodes that exist in the graph
4. No cycles (topological sort already enforces this)
5. Output type of source node is compatible with input type of destination node
   (uses a loose compatibility matrix — `any` accepts everything)

Validation errors are returned before execution starts, with `node_id`, `error_type`,
`message`, and `suggestion`.

---

## Error Normalization

Runtime Nu errors are cleaned before being returned to the model:

1. Strip internal `primitives.nu:NNN` file/line references (not actionable)
2. Extract the semantic message from Nu's verbose error format
3. Tag with the likely offending param name where detectable
4. Mark downstream nodes that received `null` due to upstream failure as `"skipped"`
   rather than `"error"` so the model sees one root cause, not a cascade

Error types returned:
- `type_mismatch` — wrong type piped into a node
- `missing_param` — required param not provided
- `unknown_type` — node type not in registry
- `invalid_port` — edge wired to a non-wirable param
- `runtime` — everything else (Nu execution error, normalized)

---

## Stored Patches as Composable APIs

Stored patches live in `patches/` as JSON files (`{alias}.json`).

A stored patch can be called via `/exec` with `{"alias": "name"}`. The server resolves
the alias to the stored graph and executes it. This means:

- A model builds `get-aapl-financials` once → saves it
- Later builds `compare-mag7` which calls `get-aapl-financials` as a black-box step
  (currently via a `const` node feeding an alias call — future: `patch` node type)
- The user can list all stored patches and see what APIs have been built

---

## PRIMITIVE_META `wirable` Field

Each entry in `PRIMITIVE_META` gains a `wirable` key listing which params accept edges.

```nu
join: {
  category: "transform", color: "#3b82f6",
  agent_hint: "SQL-style join two tables on a shared column. Wire second table to --right port.",
  param_options: {type: ["inner", "left"]},
  wirable: ["right"]
}
```

This is the authoritative source — `spec.ts` reads it and exposes it in `/nodes` and `/defs`.
The frontend uses it to render which param ports show a connection socket.

---

## Implementation Checklist

- [x] Core primitives implemented (64 nodes)
- [x] Extension system (market.nu, sec.nu)
- [x] `/run` SSE endpoint (frontend canvas)
- [x] `/exec` synchronous endpoint
- [x] `/nodes` spec endpoint

**This sprint:**
- [ ] Add `wirable: [...]` to all 64 PRIMITIVE_META entries
- [ ] Expose `wirable` per param in `spec.ts` / `NodeSpec`
- [ ] Create `server/examples.ts` — minimal example graph per node type
- [ ] Create `server/validate.ts` — pre-execution graph validation
- [ ] Update `server/execute.ts` — error normalization + `skipped` status
- [ ] Add `GET /defs` and `GET /defs/:type` routes
- [ ] Add `POST /patch`, `GET /patch/:alias`, `GET /patches` routes
- [ ] Support `{"alias": "..."}` body in `POST /exec`
- [ ] Create `patches/` storage directory

---

## Example: Model Building a Pipeline from Scratch

```
1. GET /defs
   → model receives 64 node definitions with types, params, wirable flags, examples

2. Model constructs patch in memory:
   fetch AAPL data → filter to last 30 days → col_stats on close → return

3. POST /exec (text/plain NUON)
   → validation pass: all nodes valid, all edges valid
   → execution: each node runs in topo order
   → { status: "complete", result: "{count: 30, avg: 182.4, min: 171.2, max: 195.1}" }

4. Model happy with result, stores it:
   POST /patch { alias: "aapl-30d-stats", graph: {...} }

5. Later, model builds a comparison pipeline:
   POST /exec with a graph that calls aapl-30d-stats and msft-30d-stats,
   feeds both into table_concat, returns combined table.
```

---

## Non-Goals

- No authentication on the server (local tool, model runs locally or via trusted proxy)
- No patch versioning (overwrite by alias is fine for now)
- No streaming execution for `/exec` (SSE lives on `/run` for the canvas only)
- No `patch` node type yet (stored patches called via alias at exec level, not as graph nodes)
