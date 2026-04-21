# GoNude RSS/Atom extension
# Node: feed
# Sources: any RSS 2.0 or Atom feed URL
# No API keys required.

export const RSS_PRIMITIVE_META = {
    rss_feed: {
        category: "rss"
        color: "#f97316"
        wirable: []
        agent_hint: "Fetch items from any RSS 2.0 or Atom feed URL. Returns a table with title, link, published, summary, author. Works with Reuters, Yahoo Finance, MarketWatch, SEC press releases, HN, Seeking Alpha, any standard feed."
        param_options: {}
    }
}

const RSS_UA = "Mozilla/5.0 (compatible; junction-box-rss/1.0)"

# ── Private helpers ───────────────────────────────────────────────────────────

# Find the first child element with the given tag name in an XML content list
def rss_find [tag: string]: list -> record {
    let found = ($in | where {|n| ($n | get tag? | default "") == $tag})
    if ($found | is-empty) { {tag: $tag, attributes: {}, content: []} } else { $found | first }
}

# Extract text content from a parsed XML element record
def rss_text []: record -> string {
    let c = (try { $in.content | first } catch { return "" })
    if $c == null { return "" }
    let inner = (try { $c | get content } catch { return "" })
    if ($inner | describe) == "string" { $inner } else {
        try { $inner | first | get content | into string } catch { "" }
    }
}

# Read a named attribute from a parsed XML element record
def rss_attr [attr: string]: record -> string {
    try { $in | get attributes | get $attr | into string } catch { "" }
}

# ── Primitive ─────────────────────────────────────────────────────────────────

# Fetch items from any RSS 2.0 or Atom feed URL
export def "prim-rss-feed" [
    --url:   string = ""   # RSS or Atom feed URL
    --limit: string = "20" # Max number of items to return
]: nothing -> table {
    if ($url | is-empty) {
        error make {msg: "provide --url as an RSS or Atom feed URL"}
    }

    let doc = (http get -H {User-Agent: $RSS_UA} $url)
    let n   = ($limit | into int)
    let root_tag = (try { $doc | get tag? | default "" } catch { "" })

    if $root_tag == "feed" {
        # Atom feed
        let entries = ($doc.content | where {|node| ($node | get tag? | default "") == "entry"})
        let take    = ([$n ($entries | length)] | math min)
        $entries | first $take | each {|entry|
            let ec        = $entry.content
            let link_node = ($ec | where {|node| ($node | get tag? | default "") == "link"} | first?)
            {
                title:     ($ec | rss_find "title"   | rss_text)
                link:      (try { $link_node | rss_attr "href" } catch { "" })
                published: (try { $ec | rss_find "published" | rss_text } catch { $ec | rss_find "updated" | rss_text })
                summary:   (try { $ec | rss_find "summary" | rss_text } catch { $ec | rss_find "content" | rss_text })
                author:    (try { ($ec | rss_find "author").content | rss_find "name" | rss_text } catch { "" })
            }
        }
    } else {
        # RSS 2.0 (root is <rss>)
        let channel = ($doc.content | rss_find "channel")
        let items   = ($channel.content | where {|node| ($node | get tag? | default "") == "item"})
        let take    = ([$n ($items | length)] | math min)
        $items | first $take | each {|item|
            let ic = $item.content
            {
                title:     ($ic | rss_find "title"       | rss_text)
                link:      ($ic | rss_find "link"        | rss_text)
                published: ($ic | rss_find "pubDate"     | rss_text)
                summary:   ($ic | rss_find "description" | rss_text)
                author:    (try { $ic | rss_find "author" | rss_text } catch { "" })
            }
        }
    }
}
