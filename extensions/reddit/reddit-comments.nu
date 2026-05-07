use _shared.nu *
# Fetch top-level comments for a Reddit post by post ID and subreddit. Wire post_id from a subreddit or search node. Returns a table with id, author, score, body, created_utc.
@category reddit
export def "prim-reddit-comments" [
    --post_id:   string = ""   # [wirable] Post ID (id field from subreddit/search output)
    --subreddit: string = ""   # Subreddit the post lives in
    --limit:     string = "25" # Max top-level comments to return
]: nothing -> table {
    if ($post_id | is-empty) {
        error make {msg: "provide --post_id (the id field from a subreddit or search node)"}
    }
    if ($subreddit | is-empty) {
        error make {msg: "provide --subreddit (the subreddit the post belongs to)"}
    }
    let n   = ($limit | into int)
    let url = $"($REDDIT_BASE)/r/($subreddit)/comments/($post_id).json?limit=($n)"
    let doc = (http get -H {User-Agent: $REDDIT_UA} $url)
    ($doc | get 1 | get data.children)
    | where {|c| ($c.data | get body? | default "") != "" }
    | each {|c|
        let d = $c.data
        {
            id:          (try { $d.id          } catch { "" })
            author:      (try { $d.author      } catch { "" })
            score:       (try { $d.score       } catch { 0 })
            body:        (try { $d.body        } catch { "" })
            created_utc: (try { $d.created_utc } catch { 0 })
        }
    }
}
