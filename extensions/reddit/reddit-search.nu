use _shared.nu *
# Search posts on Reddit within a subreddit or site-wide (subreddit='all'). Returns a table with id, title, author, score, num_comments, url, permalink, selftext, created_utc, flair.
@category reddit
export def "prim-reddit-search" [
    --query:     string = ""          # [wirable][required] Search query
    --subreddit: string = "all"       # Subreddit to search, or 'all' for site-wide
    --sort:      string = "relevance" # [options:relevance,top,new] Sort order
    --time:      string = "week"      # [options:day,week,month,year,hour,all] Time window
    --limit:     string = "25"        # Max posts to return (1–100)
]: nothing -> table {
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let url = if $subreddit == "all" {
        ({
            scheme: "https",
            host: "www.reddit.com",
            path: "/search.json",
            params: { q: $query_val, sort: $sort, t: $time, limit: ($cap | into string) }
        } | url join)
    } else {
        ({
            scheme: "https",
            host: "www.reddit.com",
            path: $"/r/($subreddit)/search.json",
            params: { q: $query_val, restrict_sr: "1", sort: $sort, t: $time, limit: ($cap | into string) }
        } | url join)
    }
    let doc = (http get -H {User-Agent: $REDDIT_UA} $url)
    $doc.data.children | each {|child| $child.data | reddit_post_row }
}
