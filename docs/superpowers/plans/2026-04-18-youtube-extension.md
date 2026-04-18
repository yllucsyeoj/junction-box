# YouTube Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `extensions/youtube.nu` — a GoNude extension with five nodes (search, channel, playlist, video, transcript) that require no API key.

**Architecture:** Single `.nu` file following the established extension pattern (META const + `prim-youtube-*` exports + private `yt_` helpers). Discovery nodes (search, channel, playlist) produce tables of video rows; `youtube_video` and `youtube_transcript` consume a `video_id` and are wirable. Search scrapes `ytInitialData` JSON from the YouTube results page; channel/playlist use the public Atom RSS feed; video uses oEmbed; transcript extracts the caption track URL from `ytInitialPlayerResponse` on the video page.

**Tech Stack:** Nushell 0.111, `http get`, `from xml`, `from json`, `query web`, `parse --regex`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `extensions/youtube.nu` | Create | All five nodes + private helpers |

No other files need to change — the server auto-discovers `extensions/*.nu` at startup.

---

### Task 1: File skeleton and META

**Files:**
- Create: `extensions/youtube.nu`

- [ ] **Step 1: Create the file with META const and UA constant only (no primitives yet)**

```nu
# GoNude YouTube extension
# Nodes: search, channel, playlist, video, transcript
# Sources: YouTube page scraping (search, transcript), Atom RSS (channel, playlist), oEmbed API (video)
# No API keys required.

export const YOUTUBE_PRIMITIVE_META = {
    youtube_search: {
        category: "youtube"
        color: "#ef4444"
        wirable: []
        agent_hint: "Search YouTube for videos matching a query. Returns a table of results with video_id, title, channel, channel_id, published, description, views."
        param_options: {}
    }
    youtube_channel: {
        category: "youtube"
        color: "#ef4444"
        wirable: []
        agent_hint: "Fetch recent videos from a YouTube channel. Accepts a @handle or raw channel ID (UCxxx). Returns a table with video_id, title, published, description, views, channel, channel_id."
        param_options: {}
    }
    youtube_playlist: {
        category: "youtube"
        color: "#ef4444"
        wirable: []
        agent_hint: "Fetch videos from a YouTube playlist by playlist ID. Returns a table with video_id, title, published, description, channel, channel_id."
        param_options: {}
    }
    youtube_video: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["video_id"]
        agent_hint: "Fetch metadata for a single YouTube video via oEmbed. Accepts a bare video ID or full YouTube URL. Returns a record with video_id, title, author, channel_url, thumbnail_url."
        param_options: {}
    }
    youtube_transcript: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["video_id"]
        agent_hint: "Fetch the spoken transcript of a YouTube video as plain text (no timestamps). Accepts a bare video ID or full YouTube URL. Returns a string."
        param_options: {}
    }
}

const YT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
```

- [ ] **Step 2: Verify the file loads cleanly**

```bash
nu -c "use extensions/youtube.nu *; $YOUTUBE_PRIMITIVE_META | columns"
```
Expected output:
```
╭───┬───────────────────╮
│ 0 │ youtube_search    │
│ 1 │ youtube_channel   │
│ 2 │ youtube_playlist  │
│ 3 │ youtube_video     │
│ 4 │ youtube_transcript│
╰───┴───────────────────╯
```

- [ ] **Step 3: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add extension skeleton and META"
```

---

### Task 2: Private helpers

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add the four helpers after the `YT_UA` constant**

```nu
# ── Private helpers ───────────────────────────────────────────────────────────

# Strip a YouTube URL down to the bare 11-char video ID; passthrough if already bare
def yt_normalize_id [id: string]: nothing -> string {
    if ($id | str contains "watch?v=") {
        let m = ($id | parse --regex '[?&]v=([a-zA-Z0-9_-]{11})')
        if not ($m | is-empty) { return ($m | first | get capture0) }
    }
    if ($id | str contains "youtu.be/") {
        let m = ($id | parse --regex 'youtu\.be/([a-zA-Z0-9_-]{11})')
        if not ($m | is-empty) { return ($m | first | get capture0) }
    }
    if ($id | str contains "/shorts/") {
        let m = ($id | parse --regex '/shorts/([a-zA-Z0-9_-]{11})')
        if not ($m | is-empty) { return ($m | first | get capture0) }
    }
    $id
}

# Find the first child element with the given tag name in an XML content list
def yt_xml_find [tag: string]: list -> record {
    let found = ($in | where {|n| ($n | get tag? | default "") == $tag})
    if ($found | is-empty) { {tag: $tag, attributes: {}, content: []} }
    else { $found | first }
}

# Extract the text content from a parsed XML element record
def yt_xml_text []: record -> string {
    let c1 = (try { $in.content | first } catch { return "" })
    if ($c1 == null) { return "" }
    let inner = (try { $c1 | get content } catch { return "" })
    if ($inner | describe) == "string" { $inner }
    else { try { $inner | first | get content | into string } catch { "" } }
}

# Read a named attribute from a parsed XML element record
def yt_xml_attr [attr: string]: record -> string {
    try { $in | get attributes | get $attr | into string } catch { "" }
}

# Extract and parse a JSON blob assigned to a JS variable in a YouTube page
# Usage:  $html | yt_extract_page_json "var ytInitialData = "
def yt_extract_page_json [marker: string]: string -> record {
    let start_idx = ($in | str index-of $marker)
    if $start_idx == -1 {
        error make {msg: $"Could not find '($marker)' in page — YouTube structure may have changed"}
    }
    let marker_len = ($marker | str length)
    let total_len  = ($in | str length)
    let after      = ($in | str substring ($start_idx + $marker_len)..$total_len)
    let end_idx    = ($after | str index-of ";</script>")
    if $end_idx == -1 {
        error make {msg: $"Could not parse JSON after '($marker)' — YouTube structure may have changed"}
    }
    $after | str substring 0..$end_idx | from json
}
```

- [ ] **Step 2: Verify helpers load without errors**

Private helpers are not exported, so test by verifying the file loads cleanly:

```bash
nu -c "use extensions/youtube.nu *; echo ok"
```
Expected: `ok` (no parse errors or missing-definition errors)

- [ ] **Step 3: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add private XML and page-scraping helpers"
```

---

### Task 3: RSS parse helper

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add `yt_parse_rss` helper after the other helpers**

```nu
# Fetch and parse a YouTube Atom RSS feed URL, returning up to n entries as a table
def yt_parse_rss [url: string, n: int]: nothing -> table {
    let raw = (http get -H {User-Agent: $YT_UA} $url)
    if ($raw | str trim | is-empty) {
        error make {msg: $"No data returned from RSS feed: ($url)"}
    }

    let doc      = ($raw | from xml)
    let entries  = ($doc.content | where {|node| ($node | get tag? | default "") == "entry"})
    let take     = ([$n ($entries | length)] | math min)

    $entries | first $take | each {|entry|
        let ec          = $entry.content
        let media_group = ($ec | yt_xml_find "media:group")
        let community   = ($media_group.content | yt_xml_find "media:community")
        let stats       = ($community.content   | yt_xml_find "media:statistics")
        let author_node = ($ec | yt_xml_find "author")

        {
            video_id:    ($ec | yt_xml_find "yt:videoId"         | yt_xml_text)
            title:       ($ec | yt_xml_find "title"              | yt_xml_text)
            published:   ($ec | yt_xml_find "published"          | yt_xml_text)
            description: ($media_group.content | yt_xml_find "media:description" | yt_xml_text)
            views:       (try { $stats | yt_xml_attr "views" | into int } catch { 0 })
            channel:     ($author_node.content | yt_xml_find "name" | yt_xml_text)
            channel_id:  ($ec | yt_xml_find "yt:channelId"       | yt_xml_text)
        }
    }
}
```

- [ ] **Step 2: Verify the file still loads cleanly (yt_parse_rss is private — tested indirectly via channel/playlist nodes in Tasks 4–5)**

```bash
nu -c "use extensions/youtube.nu *; echo ok"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add yt_parse_rss helper"
```

---

### Task 4: `prim-youtube-channel`

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add stub primitive after the helpers section**

```nu
# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch recent videos from a YouTube channel via Atom RSS
export def "prim-youtube-channel" [
    --channel: string = ""   # @handle (e.g. @mkbhd) or raw channel ID (UCxxx)
    --limit:   string = "15" # Max number of videos to return
]: nothing -> table {
    error make {msg: "not implemented"}
}
```

- [ ] **Step 2: Run stub to confirm command exists but errors**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-channel --channel '@mkbhd'"
```
Expected: error `not implemented`

- [ ] **Step 3: Replace stub with full implementation**

```nu
# Fetch recent videos from a YouTube channel via Atom RSS
export def "prim-youtube-channel" [
    --channel: string = ""   # @handle (e.g. @mkbhd) or raw channel ID (UCxxx)
    --limit:   string = "15" # Max number of videos to return
]: nothing -> table {
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

    yt_parse_rss $"https://www.youtube.com/feeds/videos.xml?channel_id=($channel_id)" ($limit | into int)
}
```

- [ ] **Step 4: Smoke-test with a handle and a raw channel ID**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-channel --channel '@mkbhd' --limit '3' | select video_id title channel"
```
Expected: 3-row table with `video_id`, `title`, `channel` columns populated.

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-channel --channel 'UCBcRF18a7Qf58cCRy5xuWwQ' --limit '2' | get video_id"
```
Expected: list of 2 non-empty video ID strings.

- [ ] **Step 5: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add prim-youtube-channel node"
```

---

### Task 5: `prim-youtube-playlist`

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add stub after `prim-youtube-channel`**

```nu
# Fetch videos from a YouTube playlist via Atom RSS
export def "prim-youtube-playlist" [
    --playlist_id: string = ""   # YouTube playlist ID (e.g. PLbpi6ZahtOH6...)
    --limit:       string = "25" # Max number of videos to return
]: nothing -> table {
    error make {msg: "not implemented"}
}
```

- [ ] **Step 2: Confirm stub errors**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-playlist --playlist_id 'PLbpi6ZahtOH6Ar_3GPy3workFX28'"
```
Expected: error `not implemented`

- [ ] **Step 3: Replace stub with implementation**

```nu
# Fetch videos from a YouTube playlist via Atom RSS
export def "prim-youtube-playlist" [
    --playlist_id: string = ""   # YouTube playlist ID (e.g. PLbpi6ZahtOH6...)
    --limit:       string = "25" # Max number of videos to return
]: nothing -> table {
    if ($playlist_id | is-empty) {
        error make {msg: "provide --playlist_id (the PLxxx string from the playlist URL)"}
    }
    yt_parse_rss $"https://www.youtube.com/feeds/videos.xml?playlist_id=($playlist_id)" ($limit | into int)
}
```

- [ ] **Step 4: Smoke-test**

Use the YouTube "Popular on YouTube" playlist ID `PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-`:
```bash
nu -c "use extensions/youtube.nu *; prim-youtube-playlist --playlist_id 'PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-' --limit '3' | select video_id title"
```
Expected: 3-row table with non-empty columns.

- [ ] **Step 5: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add prim-youtube-playlist node"
```

---

### Task 6: `prim-youtube-video`

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add stub**

```nu
# Fetch metadata for a single YouTube video via oEmbed
export def "prim-youtube-video" [
    --video_id: string = ""   # Bare video ID (dQw4w9WgXcQ) or full YouTube URL
]: nothing -> record {
    error make {msg: "not implemented"}
}
```

- [ ] **Step 2: Confirm stub errors**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-video --video_id 'dQw4w9WgXcQ'"
```
Expected: error `not implemented`

- [ ] **Step 3: Replace stub with implementation**

```nu
# Fetch metadata for a single YouTube video via oEmbed
export def "prim-youtube-video" [
    --video_id: string = ""   # Bare video ID (dQw4w9WgXcQ) or full YouTube URL
]: nothing -> record {
    if ($video_id | is-empty) {
        error make {msg: "provide --video_id as a bare ID or full YouTube URL"}
    }
    let vid = (yt_normalize_id $video_id)
    let url = $"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=($vid)&format=json"
    let raw = (http get -H {User-Agent: $YT_UA} $url)
    {
        video_id:      $vid
        title:         (try { $raw.title         } catch { null })
        author:        (try { $raw.author_name   } catch { null })
        channel_url:   (try { $raw.author_url    } catch { null })
        thumbnail_url: (try { $raw.thumbnail_url } catch { null })
    }
}
```

- [ ] **Step 4: Smoke-test with a bare ID and a full URL**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-video --video_id 'dQw4w9WgXcQ'"
```
Expected: record with `video_id: "dQw4w9WgXcQ"`, non-empty `title` and `author`.

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-video --video_id 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' | get title"
```
Expected: `"Never Gonna Give You Up"` (or similar)

- [ ] **Step 5: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add prim-youtube-video node"
```

---

### Task 7: `prim-youtube-transcript`

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add stub**

```nu
# Fetch the spoken transcript of a YouTube video as plain text
export def "prim-youtube-transcript" [
    --video_id: string = ""    # Bare video ID or full YouTube URL
    --lang:     string = "en"  # Caption language code (e.g. en, es, fr)
]: nothing -> string {
    error make {msg: "not implemented"}
}
```

- [ ] **Step 2: Confirm stub errors**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-transcript --video_id 'dQw4w9WgXcQ'"
```
Expected: error `not implemented`

- [ ] **Step 3: Replace stub with implementation**

The strategy: fetch the video page, extract `ytInitialPlayerResponse` JSON, find the caption track URL for the requested language, fetch and parse the caption XML into plain text.

```nu
# Fetch the spoken transcript of a YouTube video as plain text
export def "prim-youtube-transcript" [
    --video_id: string = ""    # Bare video ID or full YouTube URL
    --lang:     string = "en"  # Caption language code (e.g. en, es, fr)
]: nothing -> string {
    if ($video_id | is-empty) {
        error make {msg: "provide --video_id as a bare ID or full YouTube URL"}
    }
    let vid  = (yt_normalize_id $video_id)
    let page = (http get -H {User-Agent: $YT_UA} $"https://www.youtube.com/watch?v=($vid)")

    let player = ($page | yt_extract_page_json "var ytInitialPlayerResponse = ")

    let tracks = (try {
        $player | get captions.playerCaptionsTracklistRenderer.captionTracks
    } catch {
        error make {msg: $"No captions available for video ($vid). The video may not have subtitles."}
    })

    if ($tracks | is-empty) {
        error make {msg: $"No caption tracks found for video ($vid)."}
    }

    # Prefer exact language match; fall back to first available track
    let lang_tracks = ($tracks | where {|t| ($t | get languageCode? | default "") == $lang})
    let track       = if ($lang_tracks | is-empty) { $tracks | first } else { $lang_tracks | first }

    let caption_url = (try { $track | get baseUrl } catch {
        error make {msg: $"Could not get caption URL for video ($vid)"}
    })

    let raw = (http get -H {User-Agent: $YT_UA} $caption_url)
    if ($raw | str trim | is-empty) {
        error make {msg: $"Empty caption response for video ($vid)"}
    }

    let doc = ($raw | from xml)

    $doc.content
    | where {|node| ($node | get tag? | default "") == "text"}
    | each {|node| $node | yt_xml_text | str trim}
    | where {|s| ($s | str length) > 0}
    | str join " "
    | str replace --all "&amp;"  "&"
    | str replace --all "&lt;"   "<"
    | str replace --all "&gt;"   ">"
    | str replace --all "&#39;"  "'"
    | str replace --all "&quot;" "\""
    | str replace --all "&#34;"  "\""
}
```

- [ ] **Step 4: Smoke-test transcript extraction**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-transcript --video_id 'dQw4w9WgXcQ' | str length"
```
Expected: an integer > 0 (the transcript is several hundred characters long).

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-transcript --video_id 'dQw4w9WgXcQ' | str substring 0..200"
```
Expected: the first 200 characters of the transcript text (readable English words).

- [ ] **Step 5: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add prim-youtube-transcript node"
```

---

### Task 8: `prim-youtube-search`

**Files:**
- Modify: `extensions/youtube.nu`

- [ ] **Step 1: Add stub**

```nu
# Search YouTube for videos matching a query
export def "prim-youtube-search" [
    --query: string = ""    # Search terms
    --limit: string = "10"  # Max number of results to return
]: nothing -> table {
    error make {msg: "not implemented"}
}
```

- [ ] **Step 2: Confirm stub errors**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-search --query 'nushell tutorial'"
```
Expected: error `not implemented`

- [ ] **Step 3: Replace stub with implementation**

```nu
# Search YouTube for videos matching a query
export def "prim-youtube-search" [
    --query: string = ""    # Search terms
    --limit: string = "10"  # Max number of results to return
]: nothing -> table {
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }

    let encoded = ($query | url encode)
    let html    = (http get
        -H {User-Agent: $YT_UA}
        $"https://www.youtube.com/results?search_query=($encoded)")

    let data = ($html | yt_extract_page_json "var ytInitialData = ")

    let section = (try {
        $data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents
        | where {|c| "itemSectionRenderer" in ($c | columns)}
        | first
        | get itemSectionRenderer.contents
    } catch {
        error make {msg: "Could not parse search results — YouTube page structure may have changed"}
    })

    let videos = ($section | where {|item| "videoRenderer" in ($item | columns)})
    let n      = ($limit | into int)
    let take   = ([$n ($videos | length)] | math min)

    $videos | first $take | each {|item|
        let v = $item.videoRenderer
        {
            video_id:    (try { $v.videoId                                                                          } catch { "" })
            title:       (try { $v.title.runs | first | get text                                                    } catch { "" })
            channel:     (try { $v.ownerText.runs | first | get text                                                } catch { "" })
            channel_id:  (try { $v.ownerText.runs | first | get navigationEndpoint.browseEndpoint.browseId          } catch { "" })
            published:   (try { $v.publishedTimeText.simpleText                                                     } catch { "" })
            description: (try { $v.detailedMetadataSnippets | first | get snippetText.runs | each { get text } | str join " " } catch { "" })
            views:       (try { $v.viewCountText.simpleText                                                         } catch { "" })
        }
    }
}
```

- [ ] **Step 4: Smoke-test search**

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-search --query 'nushell tutorial' --limit '5' | select video_id title channel"
```
Expected: table with up to 5 rows, all columns non-empty.

```bash
nu -c "use extensions/youtube.nu *; prim-youtube-search --query 'rust programming' --limit '3' | get video_id"
```
Expected: list of 3 non-empty video ID strings (11 characters each).

- [ ] **Step 5: Commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): add prim-youtube-search node"
```

---

### Task 9: Final verification

**Files:**
- Read: `extensions/youtube.nu` (verify complete)

- [ ] **Step 1: Verify file loads with no errors**

```bash
nu -c "use extensions/youtube.nu *; echo ok"
```
Expected: `ok`

- [ ] **Step 2: Verify all 5 META keys are present**

```bash
nu -c "use extensions/youtube.nu *; $YOUTUBE_PRIMITIVE_META | columns"
```
Expected: 5 columns — `youtube_search`, `youtube_channel`, `youtube_playlist`, `youtube_video`, `youtube_transcript`

- [ ] **Step 3: Verify all META entries have the required `wirable` field**

```bash
nu -c "use extensions/youtube.nu *; $YOUTUBE_PRIMITIVE_META | items {|k,v| if not ('wirable' in $v) {$k}} | compact"
```
Expected: empty list `[]`

- [ ] **Step 4: Verify wirable nodes are correctly configured**

```bash
nu -c "use extensions/youtube.nu *; $YOUTUBE_PRIMITIVE_META | items {|k,v| {node: $k, wirable: $v.wirable}}"
```
Expected:
```
youtube_search    → wirable: []
youtube_channel   → wirable: []
youtube_playlist  → wirable: []
youtube_video     → wirable: ["video_id"]
youtube_transcript→ wirable: ["video_id"]
```

- [ ] **Step 5: Verify the server picks up all 5 nodes (requires server running)**

```bash
curl -s http://localhost:3001/defs | jq '[.[] | select(.category == "youtube")] | length'
```
Expected: `5`

- [ ] **Step 6: End-to-end pipeline smoke test — channel to transcript**

```bash
nu -c "
use extensions/youtube.nu *
let videos = (prim-youtube-channel --channel '@NoBoilerplate' --limit '1')
let vid_id = ($videos | first | get video_id)
prim-youtube-transcript --video_id $vid_id | str substring 0..300
"
```
Expected: the first 300 characters of a readable transcript.

- [ ] **Step 7: End-to-end pipeline smoke test — search to transcript**

```bash
nu -c "
use extensions/youtube.nu *
let vid_id = (prim-youtube-search --query 'nushell shell scripting' --limit '1' | first | get video_id)
prim-youtube-transcript --video_id $vid_id | str length
"
```
Expected: integer > 0

- [ ] **Step 8: Final commit**

```bash
git add extensions/youtube.nu
git commit -m "feat(youtube): complete YouTube extension — search, channel, playlist, video, transcript"
```
