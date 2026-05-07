# Junction Box Pipeline API — Exploration Findings

**Date:** 2026-05-07
**Explorer:** Kilo (automated agent)
**API Endpoint:** `http://127.0.0.1:3001`

---

## Patches Built & Saved

### 1. `crypto-sentiment` — Crypto Sentiment Pulse
- **Sources:** `fear-greed-now`, `coingecko-markets`, `reddit-search`
- **Transform:** `select`, `to-json`, `str-concat` chain, `llm`
- **Result:** A 3-paragraph LLM analysis of market mood, price action, and Reddit sentiment.
- **Nodes:** 16 | **Edges:** 15

### 2. `economic-health` — Economic Health Monitor
- **Sources:** `fred-series` (GDPC1, UNRATE, FEDFUNDS), `market-snapshot` (SPY)
- **Transform:** `last`, `to-json`, `str-concat` chain, `llm`
- **Result:** Macroeconomic summary covering GDP trends, labor market, Fed policy, and market performance.
- **Nodes:** 24 | **Edges:** 23

### 3. `tech-trend-radar` — Tech Trend Radar
- **Sources:** `hn-search`, `reddit-search`, `youtube-search`
- **Transform:** `select`, `to-json`, `str-concat` chain, `llm`
- **Result:** Cross-platform tech trend analysis from HN, Reddit, and YouTube engagement data.
- **Nodes:** 19 | **Edges:** 18

### 4. `reddit-search-param` — Parameterized Reddit Search
- **Param:** `query` (injected via `__param__:query` const node wired to `reddit-search.query`)
- **Result:** Demonstrates runtime parameter injection for reusable pipeline functions.

---

## Critical Bugs & Discrepancies Discovered

### 1. ALL Wirable Params Expect `string` — Regardless of Catalog Type

**Severity:** High (breaks multi-input transforms)

The catalog documents many nodes with wirable params typed as `table`, `record`, or `list`. In practice, **every wirable param port enforces `string` type at validation time**, making the following nodes unusable for their documented multi-input purpose:

| Node | Catalog Type for Wirable Param | Actual Validation Type | Impact |
|------|-------------------------------|------------------------|--------|
| `merge` | `record` (`--with`) | `string` | Cannot merge two records |
| `append` | `list<any>` (`--items`) | `string` | Cannot append lists |
| `table-concat` | `table` (`--more`) | `string` | Cannot stack tables |
| `join` | `table` (`--right`) | `string` | Cannot join tables |
| `insert-row` | `record` (`--row`) | `string` | Cannot insert record rows |

**Workaround:** Convert everything to JSON strings with `to-json` and concatenate with `str-concat`. This is the only reliable way to combine multiple data sources into a single output.

**Example of the workaround (used in all 3 patches):**
```
fear-greed-now → to-json ─┐
coingecko-markets → to-json ─┼→ str-concat chain → llm → return
reddit-search → to-json ─────┘
```

---

### 2. `to-text` Fails on Records and Tables

**Severity:** Medium

The `to-text` node (input_type: `any`, output_type: `string`) fails at runtime with:
```
"Can't convert to string."
```

This occurs when the input is a `record` or `table`. It likely only works on primitive types (int, float, bool, string).

**Workaround:** Use `to-json` or `to-nuon` for structured data serialization.

---

### 3. Catalog Param Names Frequently Mismatch Implementation

**Severity:** Medium-High (wastes time on trial-and-error)

Several nodes have param names in the catalog that don't match the actual accepted params:

| Node | Catalog Says | Actual Param | Example |
|------|-------------|--------------|---------|
| `get` | `field` | `key` | `get(key: "title")` |
| `summarize` | `col`, `op` | `cols`, `ops` | `summarize(cols: "salary", ops: "avg")` |
| `math-fn` | `fn` | `op` | `math-fn(op: "avg")` |
| `window` | `col` | `column` | `window(column: "val")` |

**Recommendation:** Always call `GET /defs/:type` before using a new node type, and trust the `valid params` error message over the catalog hint.

---

### 4. BLS Data Stale Without API Key

**Severity:** Low (documented limitation)

`bls-series` without `BLS_API_KEY` returns data only up to 2024-M03. With a key, it supports 500 queries/day and more recent data.

**Workaround:** Use `fred-series` for economic indicators instead (e.g., CPALTT01USM659S for CPI). Note: some FRED series also fail with network errors.

---

### 5. FRED CPI Series Fails with Network Error

**Severity:** Low

`fred-series(series_id: "CPALTT01USM659S")` returns:
```json
{"error_type": "network_error", "message": "Network failure"}
```

Other FRED series (GDPC1, UNRATE, FEDFUNDS, DGS10) work correctly.

---

## Design Patterns That Work Well

### 1. Multi-Source → JSON → String Concat → LLM
The only viable pattern for combining heterogeneous data sources:
1. Fetch N sources in parallel (source nodes have no incoming edges)
2. `select` relevant columns to trim token usage
3. `to-json` each source
4. `str-concat` chain with `const` header labels
5. `llm` for synthesis
6. `return`

### 2. Parameterized Patches
Using `const(value: "__param__:fieldname")` wired to a wirable param works correctly. Tested with `reddit-search-param`.

### 3. `analyze` Node for Table-First Analysis
The `analyze` node sends a table to an LLM with numbered rows. It works well for single-table analysis without needing JSON serialization.

### 4. Time-Series Trimming with `last`
`fred-series` returns chronological data (oldest first). `last(n: 6)` correctly extracts the most recent observations.

---

## What Does NOT Work (Yet)

| Goal | Attempted Node | Result |
|------|---------------|--------|
| Merge two records | `merge` | Validation fails — `with` expects string |
| Append two lists | `append` | Validation fails — `items` expects string |
| Stack two tables | `table-concat` | Validation fails — `more` expects string |
| Join two tables | `join` | Validation fails — `right` expects string |
| Insert a record row | `insert-row` | Validation fails — `row` expects string |
| Convert record to text | `to-text` | Runtime error — "Can't convert to string" |
| Combine multi-source into a structured record | `merge`, `insert-row`, `table-concat` | All blocked by string-type enforcement on wirable params |

---

## API Health Summary

| Feature | Status |
|---------|--------|
| `/exec` (direct graph) | ✅ Works |
| `/exec?outputs=full` | ✅ Works (per-node debug outputs) |
| `/exec` with `alias` | ✅ Works |
| `/exec` with `params` | ✅ Works (parameterized patches) |
| `/patch` (save) | ✅ Works |
| `/patches` (list) | ✅ Works |
| `/visualise/:alias` | ✅ Works (ASCII flowchart) |
| `/runs` (list) | ✅ Works |
| `llm` node | ✅ Works (Anthropic cloud) |
| `analyze` node | ✅ Works |
| `fear-greed-now` | ✅ Works |
| `coingecko-markets` | ✅ Works |
| `reddit-search` | ✅ Works |
| `hn-search` | ✅ Works |
| `youtube-search` | ✅ Works |
| `fred-series` | ✅ Mostly works (some series fail) |
| `market-snapshot` | ✅ Works |
| `web-htmd` | ✅ Works |
| `filter` | ✅ Works |
| `select` | ✅ Works |
| `each` | ✅ Works |
| `row-apply` | ✅ Works |
| `group-by` | ✅ Works |
| `map` | ✅ Works |
| `if` | ✅ Works |
| `window` | ✅ Works (with correct param names) |
| `math-fn` | ✅ Works (with `op` not `fn`) |
| `summarize` | ✅ Works (with `cols`/`ops`) |
| `to-json` | ✅ Works |
| `to-text` | ❌ Fails on structured data |
| `merge` | ❌ Wirable param type mismatch |
| `append` | ❌ Wirable param type mismatch |
| `table-concat` | ❌ Wirable param type mismatch |
| `join` | ❌ Wirable param type mismatch |
| `insert-row` | ❌ Wirable param type mismatch |
| `bls-series` | ⚠️ Stale data without API key |

---

## Suggested Fixes

1. **Fix wirable param type checking** — The validation layer should respect the types declared in the catalog (or the catalog should be updated to reflect the actual `string` expectation, and nodes should parse strings into their expected types).

2. **Fix `to-text`** — Should handle records and tables by falling back to a JSON-like or NUON-like string representation.

3. **Align catalog param names with implementation** — Audit all nodes for param name mismatches (`get.field` vs `get.key`, `summarize.col` vs `summarize.cols`, `math-fn.fn` vs `math-fn.op`, `window.col` vs `window.column`).

4. **Document the multi-source combining workaround** — Since record/table/list merging is blocked, the API docs should prominently feature the `to-json` + `str-concat` + `llm` pattern as the recommended way to combine heterogeneous data sources.

---

## Raw Run IDs for Reference

| Patch | Run ID | Status |
|-------|--------|--------|
| crypto-sentiment | `mov8c0fo-jwf5j` | complete |
| economic-health | `mov8cmzr-5q3l4` | complete |
| tech-trend-radar | `mov8d5pf-669vq` | complete |
| reddit-search-param | `mov8fjcq-0w61o` | complete |

---

## Fixes Applied

### Fix 1: Wirable Param Type Checking (`spec.ts`)
**File:** `server/spec.ts` (INTROSPECT_LOGIC lines 62-68)
**Change:** Wirable param ports with `[format:nuon]` or `[format:json]` now report type `any` instead of the Nu-declared `string` type.
**Why:** These primitives receive serialized JSON/NUON strings via env vars and parse them at runtime. The validation layer was rejecting valid connections because the declared type was `string`.
**Verified:** `merge`, `append`, `table-concat`, `join`, `insert-row` all now accept wired records/tables/lists.

### Fix 2: `to-text` Runtime Failure (`primitives/output/to-text.nu`)
**File:** `primitives/output/to-text.nu`
**Change:** Added type detection — records, tables, and lists are serialized with `to nuon` before converting to string; primitives still use `into string`.
**Why:** Nu's `into string` fails on structured data with "Can't convert to string."
**Verified:** Works on records, tables, lists, and plain strings.

### Fix 3: Agent Hint Param Name Mismatches
**Files:** `primitives/transform/summarize.nu`, `primitives/transform/get.nu`
**Changes:**
- `summarize`: Updated hint from `--col / --op` to `--cols / --ops` to match actual param names.
- `get`: Updated hint to explicitly mention `--key` to avoid users guessing `--field`.
**Why:** The agent_hint is the primary documentation users see in `/catalog` and `/defs`.

### Fix 4: FRED Invalid Series ID & Error Handling (`extensions/fred/fred-series.nu`)
**File:** `extensions/fred/fred-series.nu`
**Changes:**
- Replaced invalid `CPALTT01USM659S` with valid `CPIAUCSL` in agent_hint.
- Replaced `http get` with `curl` to capture HTTP status codes and FRED error response bodies.
- Added explicit 400/500 error handling that surfaces FRED's `error_message` field.
**Why:** `http get` throws generic "Network failure" on HTTP 400, hiding the actual FRED error (e.g., "The series does not exist.").
**Verified:** Invalid series now returns `FRED API error for series X: Bad Request. The series does not exist.` instead of `Network failure`.

### Not a Code Bug: BLS Stale Data
**Finding:** BLS unregistered queries work correctly when given an explicit date range. The earlier "stale" result was due to the default 10-year range returning data from the start of the range, not the end.
**Workaround:** Use `--start_year` and `--end_year` parameters to target recent data.
