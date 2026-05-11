use ../rss/_shared.nu *
# Al Jazeera top stories via RSS feed. Returns a table with title, link, published, summary, author.
@category news
export def "prim-aljazeera-feed" [
    --limit: string = "20"   # Max items to return
]: nothing -> table {
    let doc = (http get --raw -H {User-Agent: "Mozilla/5.0 (compatible; junction-box-news/1.0)"} "https://www.aljazeera.com/xml/rss/all.xml" | from xml)
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