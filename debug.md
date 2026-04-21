# GoNude Code Review - Debug Findings

## Executive Summary

The GoNude system is a well-designed node-based dataflow engine with 104 primitives and extensions. However, there are several inconsistencies and bugs that should be addressed.

---

## Issues Found

### 1. Demo Files Using Wrong Node Names (BUG - HIGH)

**File:** `demos/26-to-string-json.nuon`

**Problem:** Uses `type: "to-string"` which doesn't exist.

**Expected node names:**
- `to-json`
- `to-nuon`
- `to-csv`
- `to-text`

**Current content:**
```json
{id: "op", type: "to-string", position: {x: 200, y: 0}, params: {format: "json"}}
```

**Should be:**
```json
{id: "op", type: "to-json", position: {x: 200, y: 0}, params: {}}
```

---

### 2. DateTime Primitives Broken Due to Type Coercion (BUG - HIGH)

**Affected demos:**
- `demos/37-date-format.nuon` - fails with "Input type not supported."
- `demos/39-date-add.nuon` - fails with "Input type not supported."

**Root cause:** The `date-now` primitive serializes datetime to JSON as a string (e.g., `"2026-04-20 15:38:30.739675707 +00:00"`), but the receiving primitives (`date-format`, `date-add`) expect a datetime type. When the string is passed through the pipeline, it fails type validation.

**Location:** `primitives.nu` lines 581-608

**Fix required:** The datetime primitives need to handle both datetime objects AND strings that can be parsed back to datetime.

---

### 3. Metadata Naming Inconsistency (LOW)

The spec loader transforms node names but metadata keys don't always match:

| Extension | Meta Key | Command Name | Status |
|-----------|----------|--------------|---------|
| youtube | `youtube_search` | `prim-youtube-search` | OK |
| reddit | `reddit_subreddit` | `prim-reddit-subreddit` | OK |
| wikipedia | `wiki_search` | `prim-wikipedia-search` | Mismatch but works |
| sec | `sec_10k` | `prim-sec-10k` | OK |

Wikipedia extension uses `wiki_*` prefix in metadata but commands are `prim-wikipedia-*`. This works because of the transformation logic but is inconsistent with other extensions.

---

### 4. Demo Execution Results

All 70 demos tested (01-70):

| Range | Status |
|-------|--------|
| 01-19 | All pass |
| 20-29 | 1 failure (demo 26 - wrong node name) |
| 30-39 | 2 failures (demo 37, 39 - datetime type) |
| 40-49 | All pass |
| 50-59 | All pass |
| 60-70 | All pass |

**Success rate:** 67/70 (95.7%)

---

## Code Quality Assessment

### Conventions Consistency: GOOD

**Naming conventions followed:**
- Primitives: `prim-{category}-{name}` (e.g., `prim-filter`, `prim-market-snapshot`)
- Metadata: `{CATEGORY}_PRIMITIVE_META` (e.g., `MARKET_PRIMITIVE_META`)
- Key format: lower_snake_case for metadata keys

**Meta fields complete:**
- ✓ category
- ✓ color
- ✓ wirable
- ✓ agent_hint
- ✓ param_options

**All primitives have metadata:** Verified 71 core primitives have corresponding metadata entries.

### Extensions System: GOOD

All 12 extensions properly implemented:
- `example.nu` - template/example
- `feargreed.nu` - feargreed
- `hn.nu` - HackerNews
- `htmd.nu` - HTMD
- `market.nu` - market data (Finviz, Yahoo Finance, CBOE)
- `reddit.nu` - Reddit
- `rss.nu` - RSS feeds
- `sec.nu` - SEC/EDGAR
- `template.nu` - extension template
- `wikipedia.nu` - Wikipedia
- `youtube.nu` - YouTube

### System Primitives: CONSISTENT

The system correctly provides:
1. **Input primitives:** fetch, const, env, file_in
2. **Transform primitives:** filter, map, select, sort, count, etc.
3. **Output primitives:** display, file_out, return, to_json, etc.
4. **External primitives:** llm, analyze, http_post
5. **Compute primitives:** math, string_op, type_cast, math_fn, each
6. **Datetime primitives:** date_now, date_format, into_datetime, date_add
7. **Logic primitives:** if

### Multi-Input Wiring: WORKING

Tested and verified working with `template-multi` example:
- Edge connected to `--overlay` port correctly passes data
- Values merged as expected

---

## API Test Results

```
GET /health:      OK - returns {"status":"ok","primitives":104}
GET /defs:       OK - returns 104 node definitions
GET /defs/:type: OK - returns single node with example
```

---

## Recommendations

1. **Fix demo 26** - Change `to-string` to `to-json`
2. **Fix datetime handling** - Modify `date-format` and `date-add` to accept strings that parse to datetime
3. **Standardize wikipedia extension** - Consider renaming metadata keys to match `wikipedia_*` pattern for consistency
4. **Add demo validation** - Consider adding a CI check that validates all demo node types exist

---

## Test Command Used

```bash
# Test all demos
for f in demos/*.nuon; do 
  echo "Testing: $f"
  curl -s -X POST http://0.0.0.0:3001/exec \
    -H "Content-Type: text/plain" --data-binary "@$f" | jq -r '.status'
done
```