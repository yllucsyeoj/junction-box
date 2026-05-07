# Junction Box API Assessment

You are assessing the Junction Box API at `http://0.0.0.0:3001` from an agent's perspective.

## Step 0: Build Your Skip List (do this before any API calls)

Run the following and scan the output:

```
git log --oneline -60
```

Any issue already described in a commit message is a known fix — **do not re-report it**. Use this as a skip list, not a checklist. You are looking for new issues only.

---

## Rules

- **Explore only through the API.** Do not read source code, docs, or any local files (except the git log above).
- **Use only HTTP calls.** `curl` is fine. Start from `GET /` and follow what you find.
- **Treat yourself as the user.** You are an agent trying to get something done with this API. What confuses you? What wastes tokens? What makes you confident vs uncertain?
- **Go deep, not wide.** The probe map below tells you which dimensions have been covered at surface level. Prioritise the dimensions marked as the next target — don't re-cover ground already assessed.

---

## Probe Map

Each dimension has three depth levels. Focus your effort on the **Next** column — that's where unexplored territory starts. Do not spend significant time on already-covered levels.

| Dimension | L1 | L2 | L3 | Next |
|---|---|---|---|---|
| Discovery | ✓ | ✓ | ✓ | done |
| Pipeline construction | ✓ | ✓ | ✓ | done |
| Validation | ✓ | ✓ | ✓ | done |
| Error response consistency | ✓ | ✓ | ✓ | done |
| Persistence (patches + runs) | ✓ | ✓ | ✓ | done |
| Type system / wiring | ✓ | ✓ | ✓ | done |
| Node categories — data sources | ✓ | ✓ | ✓ | done |
| Parameterized patches | ✓ | ✓ | ✓ | done |
| Token efficiency | ✓ | ✓ | ✓ | done |
| Async / reference mode | ✓ | ✓ | ✓ | done |
| Manifest accuracy | ✓ | ✓ | ✓ | done |
| Schema consistency | ✓ | ✓ | ✓ | done |

**What each level means:**

- **L1** — does the basic feature work and return the right shape?
- **L2** — edge cases, error paths, consistency across related endpoints
- **L3** — adversarial inputs, schema accuracy vs actual behavior, message quality

**What the next targets look like in practice:**

- **Discovery L2** — is `?category=` filtering accurate? do `/defs` hints match actual node behavior? are there gaps between what the manifest promises and what exists?
- **Pipeline construction L2** — 5+ node chains, multi-source pipelines, wired params across categories, what happens at the edges of graph complexity
- **Validation L3** — are error suggestions actually correct and actionable? any false positives on valid graphs? do type mismatch messages name the right nodes?
- **Error response consistency L2** — do all endpoints use the correct HTTP codes? do all errors include a `suggestion` field? is `fatal` vs `errors` used consistently?
- **Persistence L3** — reference mode failure paths, retrieving a still-pending run, what happens when async exec fails mid-graph
- **Type system L2** — do declared `output_type` values match what nodes actually return? can you provoke a type mismatch the validator misses?
- **Node categories L2** — test `reddit`, `youtube`, `github`, `rss`, `web-htmd`, `market` (skip `hn`/`wiki` — L1 done). Do their wirable params work? Do errors surface cleanly?
- **Parameterized patches L3** — partial params (some provided, some missing), wrong param types, multiple `__param__:` in one patch, param name with special characters
- **Token efficiency L2** — measure the minimal token cost of a full discovery → exec → save flow. What responses are bloated? What could be trimmed without losing information?
- **Async L2** — what does a still-pending run look like when retrieved? what happens when an async run fails? is there any way to know when a pending run completes?
- **Manifest accuracy L2** — do `/patterns` examples actually run as-is? do the gotchas reflect current behavior? does the orientation paragraph orient correctly?
- **Schema consistency L2** — are field names consistent across related endpoints? (`alias` vs `name`, `error` vs `fatal`, `status: 'error'` present everywhere it should be?)

---

## What to Assess

Work through the API as an agent would: discover, build pipelines, handle errors, save work. As you go, note friction. Focus effort on the **Next** column of the probe map above — go deeper on those dimensions rather than re-covering L1 ground.

Build at least 3 real pipelines during assessment. Make them count — use categories and wiring patterns not yet covered.

---

## What to Produce

A structured findings report with **three** sections:

### Findings
Each finding should have:
- What the issue is
- What you observed (the specific API behavior)
- Why it matters for an agent (token cost, confusion, failure modes)

### Recommendations
Concrete, prioritized changes. For each:
- What to add, change, or remove
- What agent behavior it enables or prevents
- Rough priority (high / medium / low)

### Coverage
For each probe map dimension you touched, record what you tried and what you found. This is used to advance the probe map after the run.

Format: `dimension → what you probed → outcome`

Example:
```
- Async / reference mode → triggered async exec, retrieved pending run, retrieved completed run → clean
- Node categories → tested reddit-search, youtube-search, rss-feed → issues found (see F-4)
- Token efficiency → measured discovery + exec + save flow at ~4200 tokens → verbose manifest is the main cost
- Manifest accuracy → ran all 3 /patterns examples → patterns 1 and 3 ran clean, pattern 2 has wrong edge id
```

Untested dimensions should still be listed: `- Schema consistency → not assessed this run`

---

## Framing

Think about this question throughout: **if you had to give another agent a single paragraph to orient them to this API before they used it, what would it say — and what gaps would it leave?** The gaps are what to fix.

---

## Orientation (post-assessment, updated)

Junction Box is a node-graph execution engine. Define a pipeline as `{nodes, edges}` and POST to `/exec` — it runs synchronously and returns `{status, result, errors}`. Start with `GET /` (12KB manifest), then `GET /catalog` (32KB, 140 nodes) for discovery — it returns `name`, `category`, `input_type`, `output_type`, `agent_hint`, and `wirable_params` (a list of wirable port names) per node. Use `GET /catalog?category=X` (~700 bytes) to browse a single category efficiently. Call `GET /defs/:type` for full param details before wiring. **Every edge must include `from_port` and `to_port` explicitly** — omitting either causes a 422. Source nodes (`const`, `fetch`, data-source nodes) have `input_type: nothing` and need no incoming edge. `return` or the last node yields `result`. Add `?outputs=full` to see per-node outputs for debugging. Save working pipelines with `POST /patch` (requires `description` field). For async execution, use the `X-Reference: true` header — returns `{status: "pending", run_id}` immediately; poll `GET /runs/:run_id` for completion. Note: `POST /validate` does not exist as a standalone endpoint — validation happens inline on POST /exec (422 = pre-run error, 500 = runtime error).

**Critical things to know:**
- **22 node categories** — beyond the 8 core categories (input/transform/compute/etc.), there are 14 data-source categories: `hn`, `reddit`, `wikipedia`, `youtube`, `github`, `rss`, `web`, `market`, `coingecko`, `feargreed`, `sec`, `fred`, `bls`, `template`. Use `GET /catalog?category=hn` (etc.) to browse each.
- **`wirable_params` is a list, not a boolean** — each catalog entry has `"wirable_params": ["url"]` (or `[]`). Use it to know which ports accept wired edges.
- **Every edge needs `from_port` and `to_port`** — `{"from": "n1", "to": "n2"}` alone causes a 422. Always: `{"from": "n1", "from_port": "output", "to": "n2", "to_port": "input"}` (or the param port name for wirable params).
- **Search node `query` params are required** — `hn-search`, `hn-comments`, `reddit-search`, `wiki-search` all require `query`; omitting it fails at validation (422), not silently at runtime.
- **Type mismatches are not caught at validation** — wiring an incompatible output to a param port passes validation and fails at runtime with `"Unsupported input (expected: nothing)"`. That message refers to the node's `input_type`, not the type mismatch — it is misleading.
- **`?async=true` is not actually async** — it runs synchronously and returns the full result. Use `X-Reference: true` header for true async (pending response).
- **Failed reference runs: errors are at `.response.errors`** — not at top-level `.errors` (which is null on failure). Successful runs expose result at top-level `.result`.
- **`POST /parse-nuon`** accepts either raw NUON text (`Content-Type: text/plain`) or JSON `{"text": "..."}` (`Content-Type: application/json`) and returns the parsed JSON value.
- **`position` fields in nodes are ignored** — omit them to save tokens.
- **Parameterized patches require all params** — if a patch has `__param__:name` placeholders and you call it without params (or partial params), the API returns 422 with `fatal: "Patch requires params: name"`. Passing wrong type coerces to string silently.
- **`GET /runs/:run_id` exposes result at `.result` (top-level)** — also available at `.response.result` for the full exec object. Top-level `.result` is the shortcut (for successful runs only).
