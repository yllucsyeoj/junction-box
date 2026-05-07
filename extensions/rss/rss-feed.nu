use _shared.nu *
# Fetch items from any RSS 2.0 or Atom feed URL. Returns a table with title, link, published, summary, author. Works with Reuters, Yahoo Finance, MarketWatch, SEC press releases, HN, Seeking Alpha, any standard feed.
@category rss
export def "prim-rss-feed" [
    --url:   string = ""   # [wirable][required] RSS or Atom feed URL
    --limit: string = "20" # Max number of items to return
]: nothing -> table {
    let url_val = if ($url | str starts-with '"') { try { $url | from json } catch { $url } } else { $url }
    if ($url_val | is-empty) {
        error make {msg: "provide --url as an RSS or Atom feed URL"}
    }

    let doc = (http get -H {User-Agent: $RSS_UA} $url_val | from xml)
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
