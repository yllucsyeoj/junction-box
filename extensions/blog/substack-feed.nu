use ../rss/_shared.nu *
# Substack publication feed by publication slug. Returns a table with title, link, published, summary, author.
@category blog
export def "prim-substack-feed" [
    --publication: string = ""    # [wirable][required] Substack publication slug
    --limit: string = "20"        # Max items to return
]: nothing -> table {
    let pub_val = if ($publication | str starts-with '"') { try { $publication | from json } catch { $publication } } else { $publication }
    if ($pub_val | is-empty) {
        error make {msg: "provide --publication with a Substack publication slug"}
    }
    let doc = (http get --raw -H {User-Agent: "Mozilla/5.0 (compatible; junction-box-blog/1.0)"} ({
        scheme: "https",
        host: $"($pub_val).substack.com",
        path: "/feed"
    } | url join) | from xml)
    let n = ($limit | into int)
    let channel = ($doc.content | rss_find "channel")
    let items = ($channel.content | where {|node| ($node | get tag? | default "") == "item"})
    let take = ([$n ($items | length)] | math min)
    $items | first $take | each {|item|
        let ic = $item.content
        {
            title: ($ic | rss_find "title" | rss_text)
            link: ($ic | rss_find "link" | rss_text)
            published: ($ic | rss_find "pubDate" | rss_text)
            summary: ($ic | rss_find "description" | rss_text)
            author: (try { $ic | rss_find "author" | rss_text } catch { "" })
        }
    }
}