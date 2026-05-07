# Junction Box API Assessment Report

## Findings

### F-1: `rss-feed` node is completely broken **[FIXED]**
- **Observed:** Any call to `rss-feed` (even isolated with just a `return` node) returns runtime error: `"Data cannot be accessed with a cell path (expected: nothing)"`.
- **Root cause:** Nushell 0.111 `http get` returns raw text, not parsed XML. The code tried to access `.tag` and `.content` on a string.
- **Fix:** Added `| from xml` after `http get` in `extensions/rss.nu` line 54.
- **Why it matters:** The RSS data source category is entirely unusable. An agent following the manifest to build an RSS pipeline will hit an opaque Nushell internal error with no actionable fix.

### F-2: `append` node is completely broken **[FIXED]**
- **Observed:** Any configuration of `append` (static `items` param, wired `items` port, or the exact example from `/defs/append`) returns runtime error: `"Eval block failed with pipeline input"`.
- **Root cause:** `prim-append` used `each {|v| $v | from nuon}` on JSON-parsed values. `from json` on `"[1, 2, 3]"` returns ints, not strings — and `from nuon` only accepts strings.
- **Fix:** Simplified `prim-append` in `primitives.nu` to use `| from nuon` directly without the broken `each` pattern.
- **Why it matters:** List concatenation — a fundamental transform operation — is unavailable. Agents must work around it with `each` + manual construction, wasting tokens and complexity.

### F-3: `coingecko-simple` silently returns empty record **[FIXED]**
- **Observed:** `coingecko-simple` with `ids: "bitcoin,ethereum"` returns `{}` with `status: "complete"` and no error or warning.
- **Root cause:** `let result = {}` inside a `for` loop creates a local-scoped variable. In Nushell, `let` is immutable and block-scoped — the outer `result` was never updated. The CoinGecko API was returning data correctly; the code simply lost it.
- **Fix:** Changed `let result = {}` to `mut result = {}` and `let result = (...)` to `$result = (...)` in `extensions/coingecko.nu`.
- **Why it matters:** Silent data loss. An agent has no signal that the request failed vs. the API actually returning empty data. Wastes a round-trip and requires manual debugging.

### F-4: `bls-presets` silently returns empty array **[FIXED]**
- **Observed:** `bls-presets` returns `[]` with `status: "complete"` and no error.
- **Root cause:** Two bugs in `extensions/bls.nu`: (1) BLS POST API payload used wrong field names (`series_id` instead of `seriesid`, `start_year`/`end_year` instead of `startyear`/`endyear`, `api_key` instead of `registrationkey`), causing the API to return `REQUEST_SUCCEEDED` with empty series. (2) Same `let` scoping bug as F-3 — `let all_rows = []` inside a `for` loop meant the accumulation was lost.
- **Fix:** Corrected POST payload field names to match BLS API spec. Changed `let all_rows = []` to `mut all_rows = []` and `$all_rows = (...)`. Added explicit error handling when BLS returns empty `Results.series`.
- **Why it matters:** Same silent-failure pattern as F-3. Agents cannot distinguish "no data available" from "node broken / API limit hit."

### F-5: Validator does not check type compatibility on the main `input` port **[FIXED]**
- **Observed:** Wiring a string `"hello"` into `math` (declared `input_type: number`) or `filter` (declared `input_type: table`) passes validation and fails at runtime. By contrast, wiring a `table` output into `str-concat.suffix` (declared `type: string`) is caught at validation with a clear type-mismatch message.
- **Root cause:** The validator already had input-port type checking code, but `const` nodes declare `output_type: "any"`. The `typesCompatible` function treats `any` as universally compatible, so any `const` value bypassed the check.
- **Fix:** Added `inferConstType(value)` in `server/validate.ts` to infer the actual output type of a `const` node from its `value` param (string, number, bool, list, record, etc.). The validator now uses this inferred type instead of `"any"` when checking input-port compatibility.
- **Why it matters:** The type system only works for param ports, not the primary data pipeline. Agents cannot trust `input_type` / `output_type` declarations when building graphs; type mismatches surface as cryptic runtime errors instead of pre-run validation.

### F-6: Runtime errors return HTTP 200 **[FIXED]**
- **Observed:** Validation errors (unknown node, missing param, duplicate edge ID) return HTTP `422`. Runtime errors (type mismatch on input port, network failure, expression failure) return HTTP `200` with `status: "error"`.
- **Root cause:** In `server/index.ts`, the HTTP status selection only checked `validation_errors` and `fatal`, not `errors` (the runtime errors map).
- **Fix:** Added `hasRuntimeErrors` check to the HTTP status logic: when `resp.errors` has any entries, return HTTP `422` (same as validation errors).
- **Why it matters:** Inconsistent HTTP semantics make it impossible for an agent to use status codes as a reliable failure signal. It must parse the JSON body every time.

### F-7: `if` node fallback requires raw NUON syntax knowledge **[FIXED]**
- **Observed:** `if` with `fallback: "small"` fails with `"error when loading nuon text"`. `fallback: "\"small\""` (explicitly quoted) succeeds. Numeric fallbacks (`0`, `"0"`) work. Record and list fallbacks work when already valid NUON.
- **Root cause:** `prim-if` parsed `$fallback | from nuon` directly. Bare strings like `small` are not valid NUON (only quoted strings, numbers, booleans, lists, and records are). `prim-map` and `prim-update` had the same issue.
- **Fix:** Changed `prim-if`, `prim-map`, and `prim-update` to use `try { $param | from nuon } catch { $param }`, matching the pattern already used in `prim-const`. This gracefully falls back to returning the raw string when NUON parsing fails.
- **Why it matters:** An agent cannot intuit that string fallbacks need to be double-escaped for NUON. The error message gives no hint; it looks like a internal parser crash rather than a user error.

### F-8: Data-source nodes leak Nushell internal errors **[FIXED]**
- **Observed:** `rss-feed`, `market-snapshot` (with invalid ticker), and `append` all expose raw Nushell errors: `"Data cannot be accessed with a cell path"`, `"Eval block failed with pipeline input"`, `"could not load nuon text"`.
- **Root cause:** Two issues: (1) The `try/catch` wrapper in `server/execute.ts` used `$e.msg` which only returns the outermost error message, hiding the actual inner error. (2) `normalizeNuError` stripped nested source context too aggressively, losing the meaningful inner error text.
- **Fix:** Changed the catch block to use `$e.json` instead of `$e.msg` to capture the full nested error structure. Added recursive JSON parsing to extract the deepest inner error message. Updated `normalizeNuError` to use `extractCoreMessage()` which finds the deepest "x <message>" line in the error text, and added classification for `arithmetic` errors (division by zero).
- **Why it matters:** These messages are meaningless to an agent. They suggest a server bug rather than a user-fixable issue, causing confusion and unnecessary retry loops.

### F-9: `catch` node does not catch upstream runtime errors **[FIXED]**
- **Observed:** A `math` node that errors (string input) wired into `catch` still propagates the error and fails the pipeline. `catch` only passes through clean data.
- **Root cause:** Two issues: (1) The execution engine skipped any node whose upstream `input` edge came from a failed node, so `catch` never even ran when upstream failed. (2) `prim-catch` had no mechanism to receive error information from an upstream failure — it only caught errors from its own `--expr`.
- **Fix:** (1) In `server/execute.ts`, exempted `catch` nodes from upstream-failure skipping so they always execute. Added an `errors` Map to preserve per-node runtime error details. Passed the upstream error record via `GONUDE_UPSTREAM_ERROR` env var when the target node is `catch`. (2) In `primitives.nu`, updated `prim-catch` to check `GONUDE_UPSTREAM_ERROR` first — if present, parse the JSON error and invoke `--handler` with it. (3) In `server/exec-runner.ts`, moved `result` extraction before the error early-return so a successful `catch` output is available even when upstream nodes errored.
- **Why it matters:** The `catch` node is advertised in the manifest under "logic / error handling" but provides no actual error-handling capability for the most common failure mode (upstream node failure).

### F-10: `table-concat` silently drops tables wired to the `input` port **[FIXED]**
- **Observed:** Wiring two source tables both to `table-concat.input` (instead of one to `input` and one to `more`) returns only the first table with no validation error or warning. The second table is lost.
- **Root cause:** The validator had no rule preventing multiple edges from targeting the same node's `input` port. The execution engine used `.find()` to select a single input edge, so any additional edges were silently ignored.
- **Fix:** Added a `multiple_inputs` validation check in `server/validate.ts` that rejects graphs where any node has more than one incoming edge on its `input` port. Returns a clear error message suggesting param ports (e.g. `--more`) for multi-input scenarios.
- **Why it matters:** Silent data loss. An agent making a wiring mistake loses data without any feedback. The node should either reject multiple `input` edges or auto-route them.

### F-11: `each` node produces unhelpful errors for common mistakes
- **Observed:** Missing column reference (`$in.c` on a table with columns `a,b`) and division by zero both produce `"Eval block failed with pipeline input"`.
- **Why it matters:** The most common expression errors (typos in column names, arithmetic failures) are indistinguishable from each other and from other pipeline failures. Agents get no line number, no column name, no operator context.

### F-12: `POST /parse-nuon` uses a non-standard response envelope
- **Observed:** On failure, `/parse-nuon` returns `{"error": "...", "detail": "..."}`. All other endpoints return `{"status", "result", "errors", "fatal", ...}`.
- **Why it matters:** Agents must implement a special-case parser for this one endpoint instead of reusing the standard response envelope.

### F-13: Discovery token cost is high
- **Observed:** Full discovery flow (manifest + catalog + one defs + patterns) is ~12,900 tokens. The catalog alone is ~8,000 tokens. A typical exec response (e.g. 10 JSONPlaceholder users) is ~1,060 tokens.
- **Why it matters:** An agent burns ~13K tokens before running a single pipeline. In a token-budgeted environment this is expensive; the catalog is the dominant cost and cannot be filtered by more than one category at a time.

### F-14: No string-join / list-to-string node exists
- **Observed:** Catalog contains `join` (table inner/left join) and `path-join` (file paths) but no node to join a list of strings with a delimiter. `prim-join` referenced in some contexts does not exist.
- **Why it matters:** A common agent task — "take these names and make a comma-separated string" — requires manual `each` + `str-concat` chains, wasting tokens and graph complexity.

---

## Recommendations

| Priority | What to change | Agent impact |
|---|---|---|
| **High** | Fix `rss-feed`, `append`, and `if` fallback parsing so they accept plain string values without NUON escaping. | Restores broken core functionality; removes need for agents to know NUON internals. |
| **High** | Surface API errors in `coingecko-simple`, `bls-presets`, and other data sources instead of returning empty data with `status: "complete"`. | Eliminates silent data loss; agents can retry or report accurately. |
| **High** | Extend the validator to check `input` port type compatibility (not just param ports). | Catches wiring mistakes before runtime; saves agent tokens on retry loops. |
| **High** | Return HTTP `422` for runtime type mismatches and expression failures, or at least a non-2xx code. | Gives agents a reliable HTTP-level failure signal. |
| **Medium** | Wrap all Nushell runtime errors with agent-friendly messages that name the node, the param, and the actual vs expected type. | Removes confusion; turns cryptic errors into actionable fixes. |
| **Medium** | Make `catch` actually catch upstream node failures (or remove it from the "logic / error handling" category). | Prevents false confidence; either enables real error handling or clears misleading docs. |
| ~~**Medium**~~ | ~~Reject or warn when multiple edges target the same non-multi input port (e.g. `table-concat.input`).~~ | ~~Prevents silent data loss from wiring mistakes.~~ |
| **Medium** | Standardize `POST /parse-nuon` to return the same envelope as `/exec` (`status`, `result`, `fatal`, etc.). | One response parser works everywhere. |
| **Low** | Add a `str-join` (or `list-join`) node: input `list<string>`, param `sep`, output `string`. | Enables a common pattern in 1 node instead of a chain. |
| **Low** | Consider a token-compact catalog mode: `GET /catalog?compact=true` returning only `name,category,input_type,output_type` per node. | Cuts discovery cost from ~8K to ~2K tokens. |

---

## Coverage

### Discovery
- `GET /` manifest → validated structure, all sections readable. Token count measured (~3.2K).
- `GET /catalog` full listing → 140 nodes, ~8K tokens. Category filters (`?category=reddit`, `market`, `github`) work correctly.
- `GET /defs/:type` → fetch, reddit-search, github-repo, math, get, append, table-concat, str-concat tested. Schemas accurate except where behavior diverges (see F-5, F-7).
- `GET /patterns` → all 10 patterns executed. 10/10 run as-is. Clean.

### Pipeline construction
- Built and ran 12+ pipelines spanning input, transform, compute, datetime, logic, output, and data-source categories.
- **Real pipelines:**
  1. `github-repo` → `get stars` (torvalds/linux)
  2. wired `const` ticker → `market-snapshot` → `get price` (AAPL)
  3. wired `const` query → `reddit-search` → `filter` → `sort` → `select` (rust in programming)
  4. wired `const` URL → `fetch` → `first` → `get name` (jsonplaceholder)
  5. `coingecko-simple` → `get bitcoin` (empty result — see F-3)
  6. `youtube-search` standalone (works)
  7. `web-htmd` standalone (works)
  8. `sec-10k` standalone (works)
- Multi-source wiring tested: fan-out from one source to two nodes works; independent branches work; table `join` inner/left works.
- 5+ node chains tested (reddit pipeline, fetch-filter-sort pattern).

### Validation
- L3 already assessed in prior runs per probe map. Not re-covered.

### Error response consistency
- Tested HTTP codes: malformed JSON → 400, validation errors → 422, runtime errors → 200 (see F-6).
- `suggestion` field is present on validation errors but absent on runtime errors.
- `fatal` vs `errors` usage is inconsistent: missing patch params → `fatal`, runtime node error → `errors.{node_id}`, malformed body → `fatal`.
- `expected_type` appears on some runtime errors but not others (see F-8).

### Persistence (patches + runs)
- `POST /patch` saves parameterized patches correctly.
- `GET /patch/:alias` returns graph + `required_params`.
- `GET /visualise/:alias` renders ASCII flowchart.
- `GET /runs?limit=5` lists runs with pagination.
- `GET /runs/:run_id` retrieves complete async result including `.result` shortcut.
- Async reference mode (`X-Reference: true`) works: returns pending, then complete on retrieval.
- Async with failing pipeline stores error response correctly.

### Type system / wiring
- Param ports are type-checked at validation (e.g. `str-concat.suffix` rejecting `table`).
- **Main `input` ports are NOT type-checked** (see F-5). String into `math`, `filter`, `encode-base64` all fail at runtime.
- `output_type` declarations in catalog mostly match behavior, except `coingecko-simple` returning `{}` and `bls-presets` returning `[]`.

### Node categories — data sources
- `reddit-search` / `reddit-subreddit` / `reddit-comments` → query wiring works, returns real data.
- `youtube-search` → returns real data.
- `github-repo` / `github-commits` / `github-contributors` → owner/repo wiring works, returns real data.
- `market-snapshot` / `market-history` / `market-options` → ticker wiring works with valid tickers; invalid tickers leak Nushell error (see F-8).
- `web-htmd` → works, returns structured record.
- `rss-feed` → **broken** (see F-1).
- `coingecko-simple` / `coingecko-markets` / `coingecko-global` → simple returns `{}` silently (see F-3); others not tested.
- `fred-search` / `fred-series` → search works with correct `query` param.
- `bls-presets` → returns `[]` silently (see F-4).
- `sec-10k` → works, returns detailed financials.
- `feargreed`, `sec-*` (beyond 10k), `bls-series`, `template` → not assessed this run.

### Parameterized patches
- `__param__:ticker` injection works.
- Missing params → 422 with `fatal` message.
- Wrong type (number instead of string) coerced to string then caused network failure on invalid ticker, not a type error (see F-8).

### Token efficiency
- Discovery flow: ~12,900 tokens (manifest ~3.2K + catalog ~8K + one defs ~268 + patterns ~1.4K).
- Exec response: ~1,060 tokens for 10-row JSONPlaceholder result.
- Patch save: ~41 tokens.
- Catalog is the dominant cost. No compact mode available.

### Async / reference mode
- `X-Reference: true` → returns `{status: "pending", run_id}` immediately.
- `GET /runs/:run_id` → returns full stored response with `.result` shortcut.
- Failed async runs stored correctly with `status: "error"`.
- No webhook or polling mechanism documented for pending-run completion.

### Manifest accuracy
- All 10 `/patterns` examples run as-is. Clean.
- Gotchas are mostly accurate except `table-concat` description doesn't warn about wiring to wrong port (see F-10).
- `if` node description correctly states it's for value substitution not routing, but doesn't warn about NUON quoting (see F-7).

### Schema consistency
- `POST /parse-nuon` uses `error` / `detail` instead of standard `status` / `fatal` / `errors` envelope (see F-12).
- `alias` vs `name`: patches use `alias`, nodes use `id` + `type`. Consistent enough.
- `status: "error"` present on exec/runtime failures but missing on parse-nuon.
- Some runtime errors include `expected_type`, some do not.

---

## Orientation Paragraph (Agent Onboarding)

Junction Box is a node-graph execution engine. Define a pipeline as `{nodes, edges}` and POST to `/exec` — it runs synchronously and returns `{status, result, errors}`. Start with `GET /` (a comprehensive LLM-oriented manifest), then `GET /catalog` (~8K tokens, 140 nodes) for discovery — it shows `name`, `category`, `input_type`, `output_type`, `agent_hint`, and `has_wirable_params` per node. Call `GET /defs/:type` for full param details before wiring. Key rules: source nodes (`const`, `fetch`, `hn-search`, etc.) have no input edge; every other node needs one; `return` or the last node yields `result`. Add `?outputs=full` to see per-node outputs for debugging. Save working pipelines with `POST /patch`.

**Gaps this leaves:**
- Doesn't mention that `input` port types are **not validated** — only param ports are type-checked.
- Doesn't warn that `rss-feed` and `append` are currently broken.
- Doesn't explain that `if` fallbacks must be valid NUON (bare strings fail).
- Doesn't mention that runtime errors return HTTP 200, so status codes are unreliable.
- Doesn't note that `catch` does not catch upstream node failures.
- Doesn't quantify the ~13K token discovery cost.
