# Design: Wirable Params Expansion + Type Annotations

**Date:** 2026-04-29  
**Status:** Approved

## Context

Two improvements identified during an agent-perspective API assessment:

1. Most data-source nodes have a primary "what to fetch" param that is static-only, forcing agents to hardcode tickers, queries, URLs etc. rather than computing them dynamically. `fetch.url` already demonstrates the right pattern — extend it broadly across all data-source nodes.

2. Many nodes report `output_type: "any"` or `input_type: "any"` even though their shapes are fixed, making type-aware wiring decisions impossible without runtime trial and error. Annotate concrete types where known; keep `any` only where genuinely polymorphic.

## No infrastructure changes needed

Both pieces are purely metadata + Nu function body changes. The execution engine (`execute.ts`), validation (`validate.ts`), and spec introspection (`spec.ts`) all already support these — they just need the node definitions to declare the right things.

---

## Piece 1: Wirable Params

### Mechanism

A param becomes wirable by making three changes:

1. **Metadata**: add to `wirable: [...]` in the node's PRIMITIVE_META entry → `spec.ts` auto-exposes the port in `GET /defs/:type` and `GET /catalog`
2. **Nu function**: unwrap JSON-encoded wired values using the established pattern from `prim-fetch`:
   ```nu
   let val = if ($param | str starts-with '"') { $param | from json } else { $param }
   ```
   Wired params arrive JSON-encoded (e.g. `"\"AAPL\""`) while static flags arrive as plain strings (e.g. `"AAPL"`).
3. **Required**: add to `required_params` where the param is functionally required — so omitting it fails at 422 validation with a clear message, not 500 at runtime.

### Changes per file

| File | Node | Wirable params added | Also required? |
|------|------|---------------------|----------------|
| `extensions/htmd.nu` | `web-htmd` | `url` | yes |
| `extensions/hn.nu` | `hn-search` | `query` | already required |
| `extensions/hn.nu` | `hn-comments` | `query` | already required |
| `extensions/reddit.nu` | `reddit-search` | `query` | already required |
| `extensions/reddit.nu` | `reddit-subreddit` | `subreddit` | no (has default) |
| `extensions/wikipedia.nu` | `wiki-search` | `query` | already required |
| `extensions/youtube.nu` | `youtube-search` | `query` | yes |
| `extensions/youtube.nu` | `youtube-channel` | `channel` | yes |
| `extensions/youtube.nu` | `youtube-playlist` | `playlist_id` | yes |
| `extensions/github.nu` | `github-repo` | `owner`, `repo` | yes (both) |
| `extensions/github.nu` | `github-commits` | `owner`, `repo` | yes (both) |
| `extensions/github.nu` | `github-contributors` | `owner`, `repo` | yes (both) |
| `extensions/market.nu` | `market-snapshot` | `ticker` | yes |
| `extensions/market.nu` | `market-history` | `ticker` | yes |
| `extensions/market.nu` | `market-options` | `ticker` | yes |
| `extensions/rss.nu` | `rss-feed` | `url` | yes |
| `extensions/sec.nu` | `sec-10k` | `ticker` | yes |
| `extensions/sec.nu` | `sec-10q` | `ticker` | yes |
| `extensions/sec.nu` | `sec-8k` | `ticker` | yes |
| `extensions/sec.nu` | `sec-earnings` | `ticker` | yes |
| `extensions/sec.nu` | `sec-filing` | `ticker` | yes |
| `extensions/sec.nu` | `sec-insider` | `ticker` | yes |
| `extensions/sec.nu` | `sec-proxy` | `ticker` | yes |
| `extensions/fred.nu` | `fred-series` | `series_id` | no (default: GDPC1) |
| `extensions/fred.nu` | `fred-search` | `query` | no (default: "gdp") |
| `extensions/bls.nu` | `bls-series` | `series_ids` | no (default: CUUR0000SA0) |
| `extensions/coingecko.nu` | `coingecko-simple` | `ids` | no (default: "bitcoin") |

**Already wirable (no change needed):** `youtube-video.video_id`, `youtube-transcript.video_id`, `reddit-comments.post_id`, `wiki-summary/sections/section/table.title`

**Not wired (intentionally):** `market-screener` and `market-symbols` have no single primary key param (they take filter options). `sec-filing.accession` stays static (optional secondary lookup key).

---

## Piece 2: Type Annotations

### Mechanism

Change `-> any` in Nu function return type signatures to concrete types. `spec.ts` introspects these directly into `output_type` in the API — no other change needed.

Same for input types: changing `]: any ->` to `]: table ->` etc. flows into `input_type`.

### Output type fixes

| File | Node | `any` → |
|------|------|---------|
| `extensions/htmd.nu` | `web-htmd` | `record` |
| `extensions/market.nu` | `market-snapshot` | `record` |
| `extensions/sec.nu` | `sec-10k`, `sec-10q`, `sec-earnings`, `sec-proxy` | `record` |
| `extensions/sec.nu` | `sec-8k`, `sec-filing`, `sec-insider` | `table` |
| `extensions/coingecko.nu` | `coingecko-simple`, `coingecko-global` | `record` |
| `extensions/feargreed.nu` | `fear-greed-now` | `record` |
| `extensions/github.nu` | `github-repo` | `record` |
| `extensions/youtube.nu` | `youtube-video` | `record` |
| `primitives.nu` | `string-op` | `string` |

### Input type fixes

| File | Node | `any` → |
|------|------|---------|
| `primitives.nu` | `to-csv` | `table` |
| `primitives.nu` | `string-op`, `url-encode`, `url-decode` | `string` |
| `primitives.nu` | `hash`, `encode-base64`, `decode-base64`, `encode-hex`, `decode-hex` | `string` |
| `primitives.nu` | `date-format` | `datetime` |
| `primitives.nu` | `into-datetime` | `string` |
| `primitives.nu` | `col-stats`, `group-by`, `group-agg`, `summarize`, `window`, `null-fill`, `col-to-list` | `table` |

### Staying `any` (legitimately polymorphic)

`const`, `fetch`, `get`, `each`, `if`, `try`, `catch`, `for`, `while`, `match`, `return`, `type-cast`, `reduce`, `transpose`, `compact`, `file-in`, `math-fn`, `from-string`

---

## Verification

1. Restart server: `cd server && bun run index.ts`
2. `GET /catalog` — `has_wirable_params: true` now on newly wired nodes
3. `GET /defs/web-htmd` — `url` in `ports.inputs`, `params[url].wirable: true`
4. Pipeline: wire `const("https://example.com")` → `web-htmd.url` → `return` — should succeed
5. Pipeline: wire `const("AAPL")` → `market-snapshot.ticker` → `return` — should succeed
6. `GET /defs/hn-search` — `query` has `wirable: true`
7. Omit ticker from `market-snapshot` (no static, no wire) — should 422 with `missing_param`
8. `GET /defs/web-htmd` — `output_type: "record"`
9. `GET /defs/string-op` — `input_type: "string"`, `output_type: "string"`
10. Wire `string-op` output → `filter` input — should 422 with `type_mismatch`
