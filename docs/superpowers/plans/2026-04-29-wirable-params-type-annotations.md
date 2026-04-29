# Wirable Params Expansion + Type Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make primary "what to fetch" params wirable across all data-source nodes, and fix `nothing -> any` / `any -> string` type signatures to concrete types where the shape is fixed.

**Architecture:** Pure metadata + Nu function body changes. `spec.ts` already introspects `wirable: [...]` from PRIMITIVE_META and auto-exposes param input ports; no server infrastructure changes needed. Wired param values arrive JSON-encoded, so each function needs a one-liner to unwrap: `if ($param | str starts-with '"') { $param | from json } else { $param }`.

**Tech Stack:** Nushell (.nu), Bun/TypeScript (server), HTTP API on `http://0.0.0.0:3001`

---

## File map

| File | Change |
|------|--------|
| `extensions/htmd.nu` | `wirable: ["url"]`, `required_params: ["url"]`, JSON unwrap, `-> record` |
| `extensions/hn.nu` | `wirable: ["query"]` on both nodes, JSON unwrap |
| `extensions/reddit.nu` | `wirable: ["query"]` on reddit-search, `wirable: ["subreddit"]` on reddit-subreddit, JSON unwrap |
| `extensions/wikipedia.nu` | `wirable: ["query"]` on wiki-search, JSON unwrap |
| `extensions/youtube.nu` | `wirable: ["query"/"channel"/"playlist_id"]` on 3 nodes, `required_params` on all 3, JSON unwrap |
| `extensions/github.nu` | `wirable: ["owner","repo"]` on all 3 nodes, `required_params` on all 3, JSON unwrap |
| `extensions/market.nu` | `wirable: ["ticker"]` on snapshot/history/options, `required_params` on all 3, JSON unwrap |
| `extensions/rss.nu` | `wirable: ["url"]`, `required_params: ["url"]`, JSON unwrap |
| `extensions/sec.nu` | `wirable: ["ticker"]`, `required_params: ["ticker"]` on all 7 nodes, JSON unwrap |
| `extensions/fred.nu` | `wirable: ["series_id"]` on fred-series, `wirable: ["query"]` on fred-search, JSON unwrap (no required_params — both have defaults) |
| `extensions/bls.nu` | `wirable: ["series_ids"]` on bls-series, JSON unwrap (no required_params — has default) |
| `extensions/coingecko.nu` | `wirable: ["ids"]` on coingecko-simple, JSON unwrap (no required_params — has default "bitcoin") |
| `primitives.nu` | `prim-to-csv`: `]: any -> string` → `]: table -> string` |

---

## Server restart command

After each task that changes a `.nu` file:
```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1; cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
```

Or if dev mode is running: kill it and restart. Verify with:
```bash
curl -s http://0.0.0.0:3001/health
```

---

## Task 1: htmd.nu — wirable url + type fix

**Files:**
- Modify: `extensions/htmd.nu`

**Spec:** After this change, `GET /defs/web-htmd` must include `url` in `ports.inputs` (alongside `input`), `params[0].wirable: true`, and `output_type: "record"`. Omitting `url` from both static params and edges must produce a 422 `missing_param` error.

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/htmd.nu`, change:
```nu
export const HTMD_PRIMITIVE_META = {
    web_htmd: {
        category: "web"
        color: "#3b82f6"
        agent_hint: "Convert HTML or a URL to Markdown and rich metadata. Use --main to extract only main content, --no-images to strip images, --no-links to strip links, --raw for only markdown string."
    }
}
```
To:
```nu
export const HTMD_PRIMITIVE_META = {
    web_htmd: {
        category: "web"
        color: "#3b82f6"
        wirable: ["url"]
        required_params: ["url"]
        agent_hint: "Convert HTML or a URL to Markdown and rich metadata. Use --main to extract only main content, --no-images to strip images, --no-links to strip links, --raw for only markdown string."
    }
}
```

- [ ] **Step 2: Update function signature and add JSON unwrap**

Change `prim-web-htmd`'s signature line from `]: nothing -> any {` to `]: nothing -> record {`, and add JSON unwrapping for `$url`:

Change this block at the top of the function body:
```nu
    let rawInput = if not ($url | is-empty) { $url } else { $in }
```
To:
```nu
    let url_val  = if ($url | str starts-with '"') { $url | from json } else { $url }
    let rawInput = if not ($url_val | is-empty) { $url_val } else { $in }
```

- [ ] **Step 3: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/web-htmd | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('output_type:', d['output_type'])
print('input ports:', [p['name'] for p in d['ports']['inputs']])
url_p = next(p for p in d['params'] if p['name']=='url')
print('url.wirable:', url_p['wirable'])
print('url.required:', url_p['required'])
"
```
Expected:
```
output_type: record
input ports: ['input', 'url']
url.wirable: True
url.required: True
```

- [ ] **Step 4: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/htmd.nu
git commit -m "feat: make web-htmd.url wirable+required; annotate output as record"
```

---

## Task 2: hn.nu — wirable query on hn-search and hn-comments

**Files:**
- Modify: `extensions/hn.nu`

**Spec:** `GET /defs/hn-search` and `GET /defs/hn-comments` must include `query` in `ports.inputs` with `wirable: true`.

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/hn.nu`, add `wirable: ["query"]` to both `hn_search` and `hn_comments`:
```nu
    hn_search: {
        category: "hn"
        color: "#f97316"
        wirable: ["query"]
        required_params: ["query"]
        ...
    }
    hn_comments: {
        category: "hn"
        color: "#f97316"
        wirable: ["query"]
        required_params: ["query"]
        ...
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-hn-search**

In `prim-hn-search`, insert `let query_val` after the opening `{` and replace all `$query` usages in the body:

Change:
```nu
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query | url encode)
```
To:
```nu
    let query_val = if ($query | str starts-with '"') { $query | from json } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query_val | url encode)
```

- [ ] **Step 3: Add JSON unwrap to prim-hn-comments**

In `prim-hn-comments`, same pattern:

Change:
```nu
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query | url encode)
```
To:
```nu
    let query_val = if ($query | str starts-with '"') { $query | from json } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query_val | url encode)
```

- [ ] **Step 4: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/hn-search | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('input ports:', [p['name'] for p in d['ports']['inputs']])
"
```
Expected: `input ports: ['input', 'query']`

- [ ] **Step 5: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/hn.nu
git commit -m "feat: make hn-search and hn-comments query param wirable"
```

---

## Task 3: reddit.nu — wirable query + subreddit

**Files:**
- Modify: `extensions/reddit.nu`

**Spec:** `GET /defs/reddit-search` has `query` in ports.inputs; `GET /defs/reddit-subreddit` has `subreddit` in ports.inputs.

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/reddit.nu`:
```nu
    reddit_subreddit: {
        ...
        wirable: ["subreddit"]
        ...
    }
    reddit_search: {
        ...
        wirable: ["query"]
        required_params: ["query"]
        ...
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-reddit-subreddit**

In `prim-reddit-subreddit`, add unwrap and replace `$subreddit` in URL construction:

Change:
```nu
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let url = if $sort == "top" {
        $"($REDDIT_BASE)/r/($subreddit)/top.json?limit=($cap)&t=($time)"
    } else {
        $"($REDDIT_BASE)/r/($subreddit)/($sort).json?limit=($cap)"
    }
```
To:
```nu
    let subreddit_val = if ($subreddit | str starts-with '"') { $subreddit | from json } else { $subreddit }
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let url = if $sort == "top" {
        $"($REDDIT_BASE)/r/($subreddit_val)/top.json?limit=($cap)&t=($time)"
    } else {
        $"($REDDIT_BASE)/r/($subreddit_val)/($sort).json?limit=($cap)"
    }
```

- [ ] **Step 3: Add JSON unwrap to prim-reddit-search**

Change:
```nu
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let q   = ($query | url encode)
```
To:
```nu
    let query_val = if ($query | str starts-with '"') { $query | from json } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let q   = ($query_val | url encode)
```

- [ ] **Step 4: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/reddit-search | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('reddit-search ports:', [p['name'] for p in d['ports']['inputs']])
"
curl -s http://0.0.0.0:3001/defs/reddit-subreddit | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('reddit-subreddit ports:', [p['name'] for p in d['ports']['inputs']])
"
```
Expected:
```
reddit-search ports: ['input', 'query']
reddit-subreddit ports: ['input', 'subreddit']
```

- [ ] **Step 5: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/reddit.nu
git commit -m "feat: make reddit-search.query and reddit-subreddit.subreddit wirable"
```

---

## Task 4: wikipedia.nu — wirable query on wiki-search

**Files:**
- Modify: `extensions/wikipedia.nu`

**Spec:** `GET /defs/wiki-search` must include `query` in `ports.inputs` with `wirable: true`. (wiki-summary/sections/section/table already have `title` wirable — no change needed.)

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/wikipedia.nu`, add `wirable: ["query"]` to `wiki_search`:
```nu
    wiki_search: {
        category: "wikipedia"
        color: "#6b7280"
        wirable: ["query"]
        required_params: ["query"]
        ...
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-wiki-search**

Change:
```nu
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let q   = ($query | url encode)
```
To:
```nu
    let query_val = if ($query | str starts-with '"') { $query | from json } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let q   = ($query_val | url encode)
```

- [ ] **Step 3: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/wiki-search | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('input ports:', [p['name'] for p in d['ports']['inputs']])
"
```
Expected: `input ports: ['input', 'query']`

- [ ] **Step 4: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/wikipedia.nu
git commit -m "feat: make wiki-search.query wirable"
```

---

## Task 5: youtube.nu — wirable query, channel, playlist_id

**Files:**
- Modify: `extensions/youtube.nu`

**Spec:** `GET /defs/youtube-search` has `query` in ports.inputs; `GET /defs/youtube-channel` has `channel`; `GET /defs/youtube-playlist` has `playlist_id`. All three are also required. (`youtube-video` and `youtube-transcript` already have `video_id` wirable — no change needed.)

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/youtube.nu`:
```nu
    youtube_search: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["query"]
        required_params: ["query"]
        agent_hint: "Search YouTube for videos matching a query. Returns a table of results with video_id, title, channel, channel_id, published, description, views."
        param_options: {}
    }
    youtube_channel: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["channel"]
        required_params: ["channel"]
        agent_hint: "Fetch recent videos from a YouTube channel. Accepts a @handle or raw channel ID (UCxxx). Returns a table with video_id, title, published, description, views, channel, channel_id."
        param_options: {}
    }
    youtube_playlist: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["playlist_id"]
        required_params: ["playlist_id"]
        agent_hint: "Fetch videos from a YouTube playlist by playlist ID. Returns a table with video_id, title, published, description, channel, channel_id."
        param_options: {}
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-youtube-channel**

Change:
```nu
    if ($channel | is-empty) {
        error make {msg: "provide --channel as a @handle or UCxxx channel ID"}
    }

    let channel_id = if ($channel | str starts-with "@") {
        let html  = (http get -H {User-Agent: $YT_UA} $"https://www.youtube.com/($channel)")
        let match = ($html | parse --regex '"channelId":"(UC[a-zA-Z0-9_-]+)"')
        if ($match | is-empty) {
            error make {msg: $"Could not resolve channel ID for ($channel) — handle may not exist"}
        }
        $match | first | get capture0
    } else {
        $channel
    }
```
To:
```nu
    let channel_val = if ($channel | str starts-with '"') { $channel | from json } else { $channel }
    if ($channel_val | is-empty) {
        error make {msg: "provide --channel as a @handle or UCxxx channel ID"}
    }

    let channel_id = if ($channel_val | str starts-with "@") {
        let html  = (http get -H {User-Agent: $YT_UA} $"https://www.youtube.com/($channel_val)")
        let match = ($html | parse --regex '"channelId":"(UC[a-zA-Z0-9_-]+)"')
        if ($match | is-empty) {
            error make {msg: $"Could not resolve channel ID for ($channel_val) — handle may not exist"}
        }
        $match | first | get capture0
    } else {
        $channel_val
    }
```

- [ ] **Step 3: Add JSON unwrap to prim-youtube-playlist**

Change:
```nu
    if ($playlist_id | is-empty) {
        error make {msg: "provide --playlist_id (the PLxxx string from the playlist URL)"}
    }
    yt_parse_rss $"https://www.youtube.com/feeds/videos.xml?playlist_id=($playlist_id)" ($limit | into int)
```
To:
```nu
    let playlist_id_val = if ($playlist_id | str starts-with '"') { $playlist_id | from json } else { $playlist_id }
    if ($playlist_id_val | is-empty) {
        error make {msg: "provide --playlist_id (the PLxxx string from the playlist URL)"}
    }
    yt_parse_rss $"https://www.youtube.com/feeds/videos.xml?playlist_id=($playlist_id_val)" ($limit | into int)
```

- [ ] **Step 4: Add JSON unwrap to prim-youtube-search**

Change:
```nu
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }

    let encoded = ($query | url encode)
```
To:
```nu
    let query_val = if ($query | str starts-with '"') { $query | from json } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }

    let encoded = ($query_val | url encode)
```

- [ ] **Step 5: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
for node in youtube-search youtube-channel youtube-playlist; do
  curl -s http://0.0.0.0:3001/defs/$node | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('$node ports:', [p['name'] for p in d['ports']['inputs']])
"
done
```
Expected:
```
youtube-search ports: ['input', 'query']
youtube-channel ports: ['input', 'channel']
youtube-playlist ports: ['input', 'playlist_id']
```

- [ ] **Step 6: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/youtube.nu
git commit -m "feat: make youtube-search/channel/playlist primary params wirable+required"
```

---

## Task 6: github.nu — wirable owner + repo on all 3 nodes

**Files:**
- Modify: `extensions/github.nu`

**Spec:** `GET /defs/github-repo`, `/github-contributors`, `/github-commits` must each include `owner` and `repo` in `ports.inputs`.

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/github.nu`, add `wirable` and `required_params` to all three nodes:
```nu
    github_repo: {
        category: "github"
        color: "#24292f"
        wirable: ["owner", "repo"]
        required_params: ["owner", "repo"]
        agent_hint: "Fetch metadata for a public GitHub repository. Returns a record with name, full_name, description, language, stars, forks, watchers, open_issues, topics, created_at, pushed_at, url."
        param_options: {}
    }
    github_contributors: {
        category: "github"
        color: "#24292f"
        wirable: ["owner", "repo"]
        required_params: ["owner", "repo"]
        agent_hint: "Fetch top contributors for a public GitHub repository. Returns a table with login, contributions, avatar_url. Note: repos with 10k+ commits return 0 contributions without auth."
        param_options: {}
    }
    github_commits: {
        category: "github"
        color: "#24292f"
        wirable: ["owner", "repo"]
        required_params: ["owner", "repo"]
        agent_hint: "Fetch recent commit history for a public GitHub repository. Returns a table with sha, author, message, date."
        param_options: {}
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-github-repo**

Change:
```nu
    let url = $"https://api.github.com/repos/($owner)/($repo)"
```
To:
```nu
    let owner_val = if ($owner | str starts-with '"') { $owner | from json } else { $owner }
    let repo_val  = if ($repo  | str starts-with '"') { $repo  | from json } else { $repo }
    let url = $"https://api.github.com/repos/($owner_val)/($repo_val)"
```

- [ ] **Step 3: Add JSON unwrap to prim-github-contributors**

Change:
```nu
    let url  = $"https://api.github.com/repos/($owner)/($repo)/contributors?per_page=($limit | into int)"
```
To:
```nu
    let owner_val = if ($owner | str starts-with '"') { $owner | from json } else { $owner }
    let repo_val  = if ($repo  | str starts-with '"') { $repo  | from json } else { $repo }
    let url  = $"https://api.github.com/repos/($owner_val)/($repo_val)/contributors?per_page=($limit | into int)"
```

- [ ] **Step 4: Add JSON unwrap to prim-github-commits**

Change:
```nu
    let url = $"https://api.github.com/repos/($owner)/($repo)/commits?per_page=($limit | into int)"
```
To:
```nu
    let owner_val = if ($owner | str starts-with '"') { $owner | from json } else { $owner }
    let repo_val  = if ($repo  | str starts-with '"') { $repo  | from json } else { $repo }
    let url = $"https://api.github.com/repos/($owner_val)/($repo_val)/commits?per_page=($limit | into int)"
```

- [ ] **Step 5: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/github-repo | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('input ports:', [p['name'] for p in d['ports']['inputs']])
"
```
Expected: `input ports: ['input', 'owner', 'repo']`

- [ ] **Step 6: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/github.nu
git commit -m "feat: make github owner+repo wirable+required on all 3 nodes"
```

---

## Task 7: market.nu — wirable ticker on snapshot, history, options

**Files:**
- Modify: `extensions/market.nu`

**Spec:** `GET /defs/market-snapshot`, `/market-history`, `/market-options` each include `ticker` in `ports.inputs`. `market-screener` and `market-symbols` are NOT changed (no single primary key param).

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/market.nu`, add `wirable` and `required_params` to `market_snapshot`, `market_history`, `market_options`:
```nu
    market_snapshot: {
        category: "market"
        color: "#10b981"
        wirable: ["ticker"]
        required_params: ["ticker"]
        agent_hint: "Fetch key stats for a stock ticker from Finviz: price, P/E, market cap, margins, analyst target, etc."
        param_options: {}
    }
    market_history: {
        category: "market"
        color: "#10b981"
        wirable: ["ticker"]
        required_params: ["ticker"]
        agent_hint: "Fetch OHLCV price history for any ticker via Yahoo Finance. interval: 1m 5m 15m 1h 1d 1wk 1mo. range: 1mo 3mo 6mo 1y 2y 5y ytd max."
        param_options: {
            interval: ["1d", "1wk", "1mo", "1h", "15m", "5m", "1m"]
            range: ["1y", "6mo", "3mo", "1mo", "2y", "5y", "ytd", "max"]
        }
    }
    market_options: {
        category: "market"
        color: "#10b981"
        wirable: ["ticker"]
        required_params: ["ticker"]
        agent_hint: "Fetch options chain for a stock ticker from CBOE delayed quotes (~15min delay). Filter by expiry date or type."
        param_options: {
            type: ["both", "calls", "puts"]
        }
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-market-snapshot**

In `prim-market-snapshot`, `$ticker` is used in the first line of the body (`let sym = ($ticker | str upcase)`). Add the unwrap before it:

Change:
```nu
    let sym  = ($ticker | str upcase)
```
To:
```nu
    let ticker_val = if ($ticker | str starts-with '"') { $ticker | from json } else { $ticker }
    let sym  = ($ticker_val | str upcase)
```

- [ ] **Step 3: Add JSON unwrap to prim-market-history**

In `prim-market-history` (the function starting at line 160), change:
```nu
    let sym = ($ticker | str upcase)
```
To:
```nu
    let ticker_val = if ($ticker | str starts-with '"') { $ticker | from json } else { $ticker }
    let sym = ($ticker_val | str upcase)
```

- [ ] **Step 4: Add JSON unwrap to prim-market-options**

In `prim-market-options` (the function starting at line 278), change:
```nu
    let sym  = ($ticker | str upcase)
```
To:
```nu
    let ticker_val = if ($ticker | str starts-with '"') { $ticker | from json } else { $ticker }
    let sym  = ($ticker_val | str upcase)
```

- [ ] **Step 5: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
for node in market-snapshot market-history market-options; do
  curl -s http://0.0.0.0:3001/defs/$node | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('$node ports:', [p['name'] for p in d['ports']['inputs']])
"
done
```
Expected:
```
market-snapshot ports: ['input', 'ticker']
market-history ports: ['input', 'ticker']
market-options ports: ['input', 'ticker']
```

- [ ] **Step 6: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/market.nu
git commit -m "feat: make market-snapshot/history/options ticker wirable+required"
```

---

## Task 8: rss.nu — wirable url

**Files:**
- Modify: `extensions/rss.nu`

**Spec:** `GET /defs/rss-feed` includes `url` in `ports.inputs` with `wirable: true` and `required: true`.

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/rss.nu`:
```nu
    rss_feed: {
        category: "rss"
        color: "#f97316"
        wirable: ["url"]
        required_params: ["url"]
        agent_hint: "Fetch items from any RSS 2.0 or Atom feed URL. Returns a table with title, link, published, summary, author. Works with Reuters, Yahoo Finance, MarketWatch, SEC press releases, HN, Seeking Alpha, any standard feed."
        param_options: {}
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-rss-feed**

Change:
```nu
    if ($url | is-empty) {
        error make {msg: "provide --url as an RSS or Atom feed URL"}
    }

    let doc = (http get -H {User-Agent: $RSS_UA} $url)
```
To:
```nu
    let url_val = if ($url | str starts-with '"') { $url | from json } else { $url }
    if ($url_val | is-empty) {
        error make {msg: "provide --url as an RSS or Atom feed URL"}
    }

    let doc = (http get -H {User-Agent: $RSS_UA} $url_val)
```

- [ ] **Step 3: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/rss-feed | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('input ports:', [p['name'] for p in d['ports']['inputs']])
url_p = next(p for p in d['params'] if p['name']=='url')
print('url.required:', url_p['required'])
"
```
Expected:
```
input ports: ['input', 'url']
url.required: True
```

- [ ] **Step 4: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/rss.nu
git commit -m "feat: make rss-feed.url wirable+required"
```

---

## Task 9: sec.nu — wirable ticker on all 7 nodes

**Files:**
- Modify: `extensions/sec.nu`

**Spec:** All 7 SEC nodes (`sec-10k`, `sec-10q`, `sec-8k`, `sec-earnings`, `sec-filing`, `sec-insider`, `sec-proxy`) must have `ticker` in `ports.inputs`. `sec-filing.accession` stays static-only.

- [ ] **Step 1: Update PRIMITIVE_META**

In `extensions/sec.nu`, add `wirable: ["ticker"]` and `required_params: ["ticker"]` to all 7 entries. Example (repeat for each):
```nu
    sec_10k: {
        category: "sec"
        color: "#6366f1"
        wirable: ["ticker"]
        required_params: ["ticker"]
        agent_hint: "Fetch annual (10-K) financial data for a ticker via EDGAR XBRL: revenue, net income, assets, liabilities, operating income, EPS."
        param_options: {}
    }
```
(Apply the same two-line addition to `sec_10q`, `sec_8k`, `sec_earnings`, `sec_insider`, `sec_filing`, `sec_proxy`.)

- [ ] **Step 2: Add JSON unwrap to each of the 7 prim-sec-* functions**

Each function's first use of `$ticker` is as an argument to `sec_ticker_to_cik $ticker`. Add the unwrap before that line in each function.

For example, in `prim-sec-10k`:
```nu
    let ticker_val = if ($ticker | str starts-with '"') { $ticker | from json } else { $ticker }
    let cik    = (sec_ticker_to_cik $ticker_val)
```
Replace every subsequent `$ticker` used in the body with `$ticker_val` (e.g., `ticker: ($ticker | str upcase)` → `ticker: ($ticker_val | str upcase)`).

Repeat for all 7 functions: `prim-sec-10q`, `prim-sec-8k`, `prim-sec-earnings`, `prim-sec-insider`, `prim-sec-filing`, `prim-sec-proxy`.

- [ ] **Step 3: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/catalog | python3 -c "
import json,sys
nodes = json.load(sys.stdin)
sec = [n for n in nodes if n['name'].startswith('sec-')]
for n in sec:
    print(n['name'], '→ has_wirable_params:', n.get('has_wirable_params', False))
"
```
Expected: all 7 `sec-*` nodes show `has_wirable_params: True`.

- [ ] **Step 4: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/sec.nu
git commit -m "feat: make all sec node ticker params wirable+required"
```

---

## Task 10: fred.nu, bls.nu, coingecko.nu — wirable with defaults (not required)

**Files:**
- Modify: `extensions/fred.nu`
- Modify: `extensions/bls.nu`
- Modify: `extensions/coingecko.nu`

**Spec:** These nodes have defaults so they can run without wiring, but agents can wire in dynamic values. No `required_params` added.

- [ ] **Step 1: Update PRIMITIVE_META in fred.nu**

```nu
    fred_series: {
        category: "fred"
        color: "#059669"
        wirable: ["series_id"]
        agent_hint: "..."
        param_options: {}
    }
    fred_search: {
        category: "fred"
        color: "#059669"
        wirable: ["query"]
        agent_hint: "..."
        param_options: {}
    }
```

- [ ] **Step 2: Add JSON unwrap to prim-fred-series**

In `prim-fred-series`, change:
```nu
    let url = $"https://api.stlouisfed.org/fred/series/observations?series_id=($series_id)&api_key=($key)&file_type=json&observation_start=($s)&observation_end=($e)&units=($units)&limit=($limit | into int)"
```
To:
```nu
    let series_id_val = if ($series_id | str starts-with '"') { $series_id | from json } else { $series_id }
    let url = $"https://api.stlouisfed.org/fred/series/observations?series_id=($series_id_val)&api_key=($key)&file_type=json&observation_start=($s)&observation_end=($e)&units=($units)&limit=($limit | into int)"
```

- [ ] **Step 3: Add JSON unwrap to prim-fred-search**

In `prim-fred-search`, change:
```nu
    let q = ($query | url encode)
```
To:
```nu
    let query_val = if ($query | str starts-with '"') { $query | from json } else { $query }
    let q = ($query_val | url encode)
```

- [ ] **Step 4: Update PRIMITIVE_META in bls.nu**

```nu
    bls_series: {
        category: "bls"
        color: "#0891b2"
        wirable: ["series_ids"]
        agent_hint: "..."
        param_options: {}
    }
```

- [ ] **Step 5: Add JSON unwrap to prim-bls-series**

In `prim-bls-series`, change:
```nu
    let ids = ($series_ids | split row "," | each {|s| $s | str trim })
```
To:
```nu
    let series_ids_val = if ($series_ids | str starts-with '"') { $series_ids | from json } else { $series_ids }
    let ids = ($series_ids_val | split row "," | each {|s| $s | str trim })
```

- [ ] **Step 6: Update PRIMITIVE_META in coingecko.nu**

```nu
    coingecko_simple: {
        category: "coingecko"
        color: "#6c46c7"
        wirable: ["ids"]
        agent_hint: "..."
        param_options: {}
    }
```

- [ ] **Step 7: Add JSON unwrap to prim-coingecko-simple**

In `prim-coingecko-simple`, change:
```nu
    let url = $"https://api.coingecko.com/api/v3/simple/price?ids=($ids)&vs_currencies=($vs)&include_market_cap=($include_market_cap)&include_24hr_vol=($include_24h_vol)&include_24hr_change=true"
    let raw = (http get -H {User-Agent: $CG_UA} $url)
    let coin_ids = ($ids | split row "," | each {|id| $id | str trim })
```
To:
```nu
    let ids_val = if ($ids | str starts-with '"') { $ids | from json } else { $ids }
    let url = $"https://api.coingecko.com/api/v3/simple/price?ids=($ids_val)&vs_currencies=($vs)&include_market_cap=($include_market_cap)&include_24hr_vol=($include_24h_vol)&include_24hr_change=true"
    let raw = (http get -H {User-Agent: $CG_UA} $url)
    let coin_ids = ($ids_val | split row "," | each {|id| $id | str trim })
```

- [ ] **Step 8: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
for node in fred-series fred-search bls-series coingecko-simple; do
  curl -s http://0.0.0.0:3001/defs/$node | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('$node ports:', [p['name'] for p in d['ports']['inputs'] if p['name'] != 'input'])
"
done
```
Expected:
```
fred-series ports: ['series_id']
fred-search ports: ['query']
bls-series ports: ['series_ids']
coingecko-simple ports: ['ids']
```

- [ ] **Step 9: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add extensions/fred.nu extensions/bls.nu extensions/coingecko.nu
git commit -m "feat: make fred/bls/coingecko primary params wirable (with defaults)"
```

---

## Task 11: primitives.nu — fix to-csv input type

**Files:**
- Modify: `primitives.nu`

**Spec:** `GET /defs/to-csv` must show `input_type: "table"`. Wiring a `string` output to `to-csv` input must produce a 422 `type_mismatch` error.

- [ ] **Step 1: Change prim-to-csv signature**

In `primitives.nu`, change line 513:
```nu
export def "prim-to-csv"  []: any -> string { $in | to csv }
```
To:
```nu
export def "prim-to-csv"  []: table -> string { $in | to csv }
```

- [ ] **Step 2: Restart server and verify**

```bash
pkill -f "bun run index.ts" 2>/dev/null; sleep 1
cd /Users/joey/Projects/junction-box/server && bun run index.ts &
sleep 3
curl -s http://0.0.0.0:3001/defs/to-csv | python3 -c "
import json,sys; d=json.load(sys.stdin)
print('input_type:', d['input_type'])
print('output_type:', d['output_type'])
"
```
Expected:
```
input_type: table
output_type: string
```

Also verify type mismatch is caught by validate:
```bash
curl -s -X POST http://0.0.0.0:3001/validate \
  -H 'Content-Type: application/json' \
  -d '{"nodes":[{"id":"n1","type":"const","params":{"value":"hello"}},{"id":"n2","type":"to-csv","params":{}}],"edges":[{"id":"e1","from":"n1","from_port":"output","to":"n2","to_port":"input"}]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['error_type'] for e in d['errors']])"
```
Expected: `['type_mismatch']`

- [ ] **Step 3: Commit**

```bash
cd /Users/joey/Projects/junction-box
git add primitives.nu
git commit -m "fix: to-csv input type any -> table for accurate type checking"
```

---

## Final verification

After all tasks complete, run this end-to-end check:

```bash
# 1. Catalog shows newly wired nodes
curl -s http://0.0.0.0:3001/catalog | python3 -c "
import json,sys
nodes = json.load(sys.stdin)
wired = [n['name'] for n in nodes if n.get('has_wirable_params')]
print(f'{len(wired)} wirable nodes:', sorted(wired))
"

# 2. Spot-check one wired exec: const(AAPL) -> market-snapshot.ticker -> return
curl -s -X POST http://0.0.0.0:3001/exec \
  -H 'Content-Type: application/json' \
  -d '{
    "nodes":[
      {"id":"n1","type":"const","params":{"value":"AAPL"}},
      {"id":"n2","type":"market-snapshot","params":{}},
      {"id":"n3","type":"return","params":{}}
    ],
    "edges":[
      {"id":"e1","from":"n1","from_port":"output","to":"n2","to_port":"ticker"},
      {"id":"e2","from":"n2","from_port":"output","to":"n3","to_port":"input"}
    ]
  }' | python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d['status']); print('ticker:', d.get('result',{}).get('ticker','?'))"

# 3. Missing required param -> 422
curl -s -X POST http://0.0.0.0:3001/exec \
  -H 'Content-Type: application/json' \
  -d '{"nodes":[{"id":"n1","type":"market-snapshot","params":{}}],"edges":[]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d['status']); [print(e['error_type'],e['message'][:60]) for e in d.get('validation_errors',[])]"
```
