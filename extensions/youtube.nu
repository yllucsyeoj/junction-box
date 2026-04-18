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
    if ($found | is-empty) { {tag: $tag, attributes: {}, content: []} } else { $found | first }
}

# Extract the text content from a parsed XML element record
def yt_xml_text []: record -> string {
    let c1 = (try { $in.content | first } catch { return "" })
    if ($c1 == null) { return "" }
    let inner = (try { $c1 | get content } catch { return "" })
    if ($inner | describe) == "string" { $inner } else { try { $inner | first | get content | into string } catch { "" } }
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

# Fetch and parse a YouTube Atom RSS feed URL, returning up to n entries as a table
# Note: Nu's http get auto-parses XML responses, so $doc is already a parsed record
def yt_parse_rss [url: string, n: int]: nothing -> table {
    let doc      = (http get -H {User-Agent: $YT_UA} $url)
    let entries  = ($doc.content | where {|node| ($node | get tag? | default "") == "entry"})
    let take     = ([$n ($entries | length)] | math min)

    $entries | first $take | each {|entry|
        let ec          = $entry.content
        let media_group = ($ec | yt_xml_find "group")
        let community   = ($media_group.content | yt_xml_find "community")
        let stats       = ($community.content   | yt_xml_find "statistics")
        let author_node = ($ec | yt_xml_find "author")

        {
            video_id:    ($ec | yt_xml_find "videoId"      | yt_xml_text)
            title:       ($ec | yt_xml_find "title"        | yt_xml_text)
            published:   ($ec | yt_xml_find "published"    | yt_xml_text)
            description: ($media_group.content | yt_xml_find "description" | yt_xml_text)
            views:       (try { $stats | yt_xml_attr "views" | into int } catch { 0 })
            channel:     ($author_node.content | yt_xml_find "name" | yt_xml_text)
            channel_id:  ($ec | yt_xml_find "channelId"    | yt_xml_text)
        }
    }
}

# ── Primitives ────────────────────────────────────────────────────────────────

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
