use ../rss/_shared.nu *
# Medium publication feed by username. Returns a table with title, link, published, summary, author.
@category blog
export def "prim-medium-feed" [
    --user: string = ""    # [wirable][required] Medium username or publication slug
    --limit: string = "20" # Max items to return
]: nothing -> table {
    let user_val = if ($user | str starts-with '"') { try { $user | from json } catch { $user } } else { $user }
    if ($user_val | is-empty) {
        error make {msg: "provide --user with a Medium username or publication slug"}
    }
    let doc = (http get --raw -H {User-Agent: "Mozilla/5.0 (compatible; junction-box-blog/1.0)"} $"https://medium.com/feed/($user_val)" | from xml)
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