export const YT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Strip a YouTube URL down to the bare 11-char video ID; passthrough if already bare
export def yt_normalize_id [id: string]: nothing -> string {
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
export def yt_xml_find [tag: string]: list -> record {
    let found = ($in | where {|n| ($n | get tag? | default "") == $tag})
    if ($found | is-empty) { {tag: $tag, attributes: {}, content: []} } else { $found | first }
}

# Extract the text content from a parsed XML element record
export def yt_xml_text []: record -> string {
    let c1 = (try { $in.content | first } catch { return "" })
    if ($c1 == null) { return "" }
    let inner = (try { $c1 | get content } catch { return "" })
    if ($inner | describe) == "string" { $inner } else { try { $inner | first | get content | into string } catch { "" } }
}

# Read a named attribute from a parsed XML element record
export def yt_xml_attr [attr: string]: record -> string {
    try { $in | get attributes | get $attr | into string } catch { "" }
}

# Extract and parse a JSON blob assigned to a JS variable in a YouTube page
export def yt_extract_page_json [marker: string]: string -> record {
    let start_idx = ($in | str index-of $marker)
    if $start_idx == -1 {
        error make {msg: $"Could not find '($marker)' in page — YouTube structure may have changed"}
    }
    let marker_len = ($marker | str length)
    let total_len  = ($in | str length)
    let after      = ($in | str substring ($start_idx + $marker_len)..$total_len)

    let end_script = ($after | str index-of ";</script>")
    let end_var    = ($after | str index-of ";var ")

    let end_idx = if $end_script == -1 and $end_var == -1 {
        error make {msg: $"Could not parse JSON after '($marker)' — YouTube structure may have changed"}
        -1
    } else if $end_script == -1 {
        $end_var
    } else if $end_var == -1 {
        $end_script
    } else {
        [$end_script $end_var] | math min
    }

    $after | str substring 0..($end_idx - 1) | from json
}

# Fetch and parse a YouTube Atom RSS feed URL, returning up to n entries as a table
export def yt_parse_rss [url: string, n: int]: nothing -> table {
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
