# Junction Box API Assessment Report

## Findings

### F-1 — Server crash/hang on type-mismatch wiring
- **What:** Wiring an `int` output to a param port that expects `string` (e.g., `const.value: 42` → `fetch.url`) causes the server to hang indefinitely and become completely unresponsive to all subsequent requests.
- **Observed:** After POSTing a graph with `{"from":"src","from_port":"output","to":"bad","to_port":"url"}` where `src` is `const` with `value: 42`, the request times out. All following requests (including health checks) also time out until the container is restarted.
- **Why it matters:** A single malformed pipeline from an agent can kill the entire API instance. This is a show-stopper for autonomous agent use — there is no safe way to experiment with wiring without risking a crash.

### F-2 — web-htmd agent_hint promises params that do not exist
- **What:** The catalog entry for `web-htmd` says: "Use --main to extract only main content, --no-images to strip images, --no-links to strip links, --raw for only markdown string."
- **Observed:** `GET /defs/web-htmd` reveals only two params: `url` (required, wirable) and `user-agent` (optional). Passing `raw: true` returns validation error `Unknown param "raw"`.
- **Why it matters:** Agents rely on catalog hints to construct pipelines. False promises about params waste tokens on retry loops and erode trust in the catalog.

### F-3 — try node fails with "Error when loading" instead of returning fallback
- **What:** The `try` node is documented as "Try an expression, return fallback NUON on error."
- **Observed:** When input is a string (`"not a record"`) and `expr` is `$in.name`, the node errors with `"Error when loading"` rather than returning the `fallback` value. With a valid record input it works.
- **Why it matters:** The `try` node is an agent's safety net for expressions that might fail. If it doesn't actually catch errors, agents cannot build robust pipelines.

### F-4 — Parameterized patch with object param coerces unexpectedly
- **What:** Passing a JSON object as a parameterized patch value yields surprising output.
- **Observed:** Patch with `__param__:message` → exec with `params: {"message": {"nested": "object"}}` → result is `["object", "Object"]` instead of the original object.
- **Why it matters:** Agents may pass structured config objects as params. Silent coercion destroys data shape and makes parameterized patches unreliable for non-scalar values.

### F-5 — Async runtime error messages are misleading
- **What:** When an async fetch receives a 404, the stored error says `"Network failure (expected: nothing)"`.
- **Observed:** `GET /runs/:run_id` shows `.response.errors.bad.message: "Network failure (expected: nothing)"` with `expected_type: "nothing"`.
- **Why it matters:** `"expected: nothing"` refers to the node's `input_type`, not the error cause. Agents reading this think the problem is a type mismatch on the input port, when it's actually a network failure.

### F-6 — join returns empty array silently on JSON table data
- **What:** Using `join` on two fetched JSON tables with mismatched column names returns `[]` without any warning.
- **Observed:** `users` table has `id`; `posts` table has `userId`. Join `on: "userId"` returns `[]` instead of an error or joined data.
- **Why it matters:** Silent empty results are hard to debug. Agents can't tell if the join worked and found no matches, or if the column mapping was wrong.

### F-7 — Discovery token cost is high
- **What:** The minimal discovery → exec → save flow costs ~52KB of response tokens.
- **Observed:** Manifest = 12,834 bytes; full catalog = 32,179 bytes; category catalog = ~7,959 bytes; defs = ~1,151 bytes; patterns = 5,612 bytes.
- **Why it matters:** Agents working with tight context windows spend most of their budget on discovery before executing anything. Category filtering helps, but the manifest itself is still 12KB.

### F-8 — `?async=true` runs synchronously (documented but confusing)
- **What:** The query param `?async=true` does not return a pending run_id.
- **Observed:** It returns a full synchronous response identical to omitting the param.
- **Why it matters:** Even though documented in the orientation, the param name is misleading. Agents might discover it via endpoint introspection and expect true async behavior.

## Recommendations

| Priority | What to change | Agent impact |
|---|---|---|
| **High** | Fix the server crash on type-mismatch wiring (F-1). Catch incompatible types at validation time or safely coerce at runtime. | Prevents a single bad graph from killing the API. Enables safe agent experimentation. |
| **High** | Align `web-htmd` agent_hint with actual params, or implement the promised params (F-2). | Eliminates false retry loops and rebuilds catalog trust. |
| **High** | Fix `try` node to actually catch expression errors and return fallback (F-3). | Gives agents a reliable safety net for risky expressions. |
| **Medium** | Preserve object/array shape in parameterized patch injection (F-4). | Enables structured config passing through patch params. |
| **Medium** | Improve async runtime error messages to omit `(expected: nothing)` and name the actual failure (F-5). | Reduces agent confusion when diagnosing failed async runs. |
| **Medium** | Add a warning when join produces zero rows, or validate that `on` column exists in both tables (F-6). | Saves agent debugging tokens on silent empty results. |
| **Medium** | Add a `POST /validate` standalone endpoint (F-8). | Lets agents cheaply check graphs before exec, avoiding crash risk and wasted runs. |
| **Low** | Consider a compact catalog format or summary endpoint to reduce discovery token cost (F-7). | Lowers the barrier to entry for context-constrained agents. |

## Coverage

- **Discovery** → tested manifest, catalog, catalog?category, defs, patterns, visualise → clean except web-htmd hint inaccuracy
- **Pipeline construction** → built 5+ real pipelines: reddit→col-to-list, github→get, fetch→filter→sort, fetch+posts→join, const→str-concat→return, multi-source const→join, group-by→group-agg → clean
- **Validation** → tested missing required params, unknown node types, missing from_port, type mismatches (caught), duplicate edges, multiple inputs, empty graph, unknown params → detailed helpful errors
- **Error response consistency** → sync errors, async errors, validation errors all share same envelope shape with `status`, `errors`, `fatal`, `result` → consistent
- **Persistence (patches + runs)** → POST /patch, GET /patches, GET /patch/:alias, exec by alias, GET /runs, GET /runs/:run_id → clean
- **Type system / wiring** → tested wirable params on fetch.url, reddit.query, str-concat.prefix/suffix, join.right → clean
- **Node categories — data sources** → tested reddit-search, youtube-search, rss-feed, market-snapshot, coingecko-simple, web-htmd, github-repo → clean except web-htmd hint
- **Parameterized patches** → tested string param, missing params (clear error), number param, object param (coercion issue) → mostly clean
- **Token efficiency** → measured discovery + exec + save flow at ~52,000 bytes → manifest and full catalog dominate cost
- **Async / reference mode** → triggered async exec, retrieved completed run, retrieved failed async run → clean except misleading error message
- **Manifest accuracy** → ran fetch-filter-sort, extract-nested-field, table-join, string-interpolation, group-aggregate patterns → all ran clean
- **Schema consistency** → checked response envelopes across exec, runs, patches, patterns → consistent field names (`status`, `errors`, `fatal`, `result`) present everywhere

---

**Orientation paragraph for another agent:**

Junction Box is a node-graph execution engine. Define a pipeline as `{nodes, edges}` and POST to `/exec` — it runs synchronously and returns `{status, result, errors}`. Start with `GET /` (12KB manifest), then `GET /catalog?category=X` (~7KB) for discovery. Use `GET /defs/:type` for full param details before wiring. **Every edge must include `from_port` and `to_port` explicitly** — omitting either causes a 422. Source nodes (`const`, `fetch`, data-source nodes) have `input_type: nothing` and need no incoming edge. `return` or the last node yields `result`. Add `?outputs=full` to see per-node outputs for debugging. Save working pipelines with `POST /patch` (requires `description` field). For async execution, use the `X-Reference: true` header — returns `{status: "pending", run_id}` immediately; poll `GET /runs/:run_id` for completion. **Critical caution: do NOT wire incompatible types to param ports (e.g., int → string url) — this crashes the server.**
