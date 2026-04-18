# YouTube Extension Design

**Date:** 2026-04-18  
**File:** `extensions/youtube.nu`  
**Status:** Approved

---

## Overview

A GoNude extension for YouTube data retrieval — no API key required. Provides five nodes covering discovery (search, channel, playlist), metadata inspection (video), and content extraction (transcript). The primary pipeline use case is finding videos by topic or channel and extracting their transcripts for analysis.

---

## Constraints

- No YouTube Data API key — all data sourced from public endpoints
- Consistent with existing extensions: pure HTTP via `http get`, structured output, no side effects
- `youtube_search` is the one fragile node (scrapes `ytInitialData` JSON from the results page); the other four use stable public APIs and are unlikely to break

---

## Nodes

### `youtube_search`

**Purpose:** Find videos matching a search query — primary discovery entry point for topic-based research.

**Params:**
- `--query: string = ""` — search terms
- `--limit: string = "10"` — max results to return

**Method:**
1. `http get https://www.youtube.com/results?search_query=<encoded_query>` with a browser User-Agent
2. Regex-extract the `var ytInitialData = {...};` blob from the page HTML
3. Parse as JSON, walk `contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents` to find `videoRenderer` items
4. Return up to `--limit` results

**Returns:** `table` — `video_id`, `title`, `channel`, `channel_id`, `published`, `description`, `views`

**Wirable:** `[]` — entry point node

**Fragility:** Medium. If YouTube changes `ytInitialData` structure, this node breaks. Other nodes are unaffected.

---

### `youtube_channel`

**Purpose:** Get recent videos from a YouTube channel — discovery entry point when the channel is known.

**Params:**
- `--channel: string = ""` — accepts `@handle` (e.g. `@mkbhd`) or raw channel ID (e.g. `UCBcRF18a7Qf58cCRy5xuWwQ`)
- `--limit: string = "15"` — max results

**Method:**
1. If `--channel` starts with `@`: scrape `https://www.youtube.com/@handle`, extract `<meta itemprop="channelId" content="...">` to resolve to channel ID
2. Fetch RSS: `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`
3. Parse XML entries, return up to `--limit`

**Returns:** `table` — `video_id`, `title`, `published`, `description`, `views`, `channel`, `channel_id`

**Wirable:** `[]` — entry point node

---

### `youtube_playlist`

**Purpose:** Get videos from a known playlist.

**Params:**
- `--playlist_id: string = ""` — YouTube playlist ID (e.g. `PLbpi6ZahtOH6Ar_3GPy3workFX28`)
- `--limit: string = "25"` — max results

**Method:** Fetch RSS `https://www.youtube.com/feeds/videos.xml?playlist_id=PLAYLIST_ID`, parse XML entries.

**Returns:** `table` — `video_id`, `title`, `published`, `description`, `channel`, `channel_id`

**Wirable:** `[]` — entry point node

---

### `youtube_video`

**Purpose:** Get metadata for a single video — useful for inspecting a video before pulling its transcript, or as a bridge node between discovery and transcript.

**Params:**
- `--video_id: string = ""` — bare video ID (e.g. `dQw4w9WgXcQ`) or full YouTube URL

**Method:**
1. If `--video_id` looks like a URL, extract the `v=` query param or `/shorts/` path segment
2. Call `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=VIDEO_ID&format=json`

**Returns:** `record` — `video_id`, `title`, `author`, `channel_url`, `thumbnail_url`

**Wirable:** `["video_id"]` — can be wired from a `video_id` column in search/channel/playlist output

---

### `youtube_transcript`

**Purpose:** Extract the spoken transcript of a video as plain text — the terminal extraction node.

**Params:**
- `--video_id: string = ""` — bare video ID or full YouTube URL
- `--lang: string = "en"` — caption language code

**Method:**
1. Normalize `--video_id` (strip URL if needed, same helper as `youtube_video`)
2. Fetch `https://www.youtube.com/api/timedtext?v=VIDEO_ID&lang=LANG`
3. Parse the XML response (`<text start="..." dur="...">...</text>` elements)
4. Unescape HTML entities, strip timestamps, join all text segments with spaces

**Returns:** `string` — plain transcript text, no timestamps

**Wirable:** `["video_id"]` — can be wired from search/channel/playlist `video_id` column or from `youtube_video` output

---

## Private Helpers

All helpers prefixed `yt_` to avoid collisions with other extensions.

- `yt_normalize_id` — strips a YouTube URL down to bare video ID; passthrough if already bare
- `yt_parse_rss` — parses YouTube RSS XML into a standard table (shared by channel + playlist nodes)
- `yt_rss_views` — extracts view count from the `media:community` element in RSS entries

---

## Pipeline Examples

```
# Topic research: find videos, grab transcripts
youtube_search --query "rust programming" → youtube_transcript

# Channel deep-dive: get recent videos, pull transcripts
youtube_channel --channel "@NoBoilerplate" → youtube_transcript

# Selective: inspect metadata first, then pull transcript
youtube_search --query "zig lang" → youtube_video → youtube_transcript

# Playlist analysis
youtube_playlist --playlist_id "PLxxxx" → youtube_transcript
```

---

## Extension Checklist

Before shipping:

```nu
nu -c "use extensions/youtube.nu *; echo ok"
nu -c "use extensions/youtube.nu *; $YOUTUBE_PRIMITIVE_META | columns"
nu -c "use extensions/youtube.nu *; $YOUTUBE_PRIMITIVE_META | items {|k,v| if not ('wirable' in $v) {$k}} | compact"
curl http://localhost:3001/defs | jq '[.[] | select(.category == "youtube")] | length'
# Smoke-test each node:
nu -c "use extensions/youtube.nu *; youtube-search --query 'test' --limit '3'"
nu -c "use extensions/youtube.nu *; youtube-channel --channel '@mkbhd' --limit '5'"
nu -c "use extensions/youtube.nu *; youtube-transcript --video_id 'dQw4w9WgXcQ'"
```
