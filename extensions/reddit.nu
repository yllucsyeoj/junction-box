# GoNude Reddit extension
# Nodes: subreddit, search, comments
# Source: old.reddit.com JSON API — no auth required

export const REDDIT_PRIMITIVE_META = {
    reddit_subreddit: {
        category: "reddit"
        color: "#ff4500"
        wirable: []
        agent_hint: "Fetch posts from a Reddit subreddit. Returns a table with id, title, author, score, upvote_ratio, num_comments, url, permalink, selftext, created_utc, flair."
        param_options: {
            sort: ["hot", "new", "top", "rising"]
            time: ["day", "week", "month", "year", "hour", "all"]
        }
    }
    reddit_search: {
        category: "reddit"
        color: "#ff4500"
        wirable: []
        agent_hint: "Search posts on Reddit within a subreddit or site-wide (subreddit='all'). Returns a table with id, title, author, score, num_comments, url, permalink, selftext, created_utc, flair."
        param_options: {
            sort: ["relevance", "top", "new"]
            time: ["day", "week", "month", "year", "hour", "all"]
        }
    }
    reddit_comments: {
        category: "reddit"
        color: "#ff4500"
        wirable: ["post_id"]
        agent_hint: "Fetch top-level comments for a Reddit post by post ID and subreddit. Wire post_id from a subreddit or search node. Returns a table with id, author, score, body, created_utc."
        param_options: {}
    }
}

const REDDIT_UA   = "Mozilla/5.0 (compatible; gonude-reddit/1.0)"
const REDDIT_BASE = "https://old.reddit.com"

# ── Private helpers ───────────────────────────────────────────────────────────

# Decode common HTML entities used in Reddit titles and text
def reddit_decode []: string -> string {
    $in
    | str replace --all "&amp;"  "&"
    | str replace --all "&lt;"   "<"
    | str replace --all "&gt;"   ">"
    | str replace --all "&#39;"  "'"
    | str replace --all "&quot;" '"'
    | str replace --all "&#34;"  '"'
}

# Map a raw Reddit post data record to a clean output row
def reddit_post_row []: record -> record {
    let d = $in
    {
        id:           (try { $d.id                                           } catch { "" })
        title:        (try { $d.title | reddit_decode                        } catch { "" })
        author:       (try { $d.author                                       } catch { "" })
        score:        (try { $d.score                                        } catch { 0 })
        upvote_ratio: (try { $d.upvote_ratio                                 } catch { 0.0 })
        num_comments: (try { $d.num_comments                                 } catch { 0 })
        url:          (try { $d.url                                          } catch { "" })
        permalink:    (try { $"($REDDIT_BASE)($d.permalink)"                 } catch { "" })
        selftext:     (try { $d.selftext                                     } catch { "" })
        created_utc:  (try { $d.created_utc                                  } catch { 0 })
        flair:        (try { $d.link_flair_text | default ""                 } catch { "" })
    }
}

# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch posts from a Reddit subreddit
export def "prim-reddit-subreddit" [
    --subreddit: string = "wallstreetbets" # Subreddit name without r/
    --sort:      string = "hot"            # Sort order: hot new top rising
    --time:      string = "day"            # Time window (top only): hour day week month year all
    --limit:     string = "25"             # Max posts to return (1–100)
]: nothing -> table {
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let url = if $sort == "top" {
        $"($REDDIT_BASE)/r/($subreddit)/top.json?limit=($cap)&t=($time)"
    } else {
        $"($REDDIT_BASE)/r/($subreddit)/($sort).json?limit=($cap)"
    }
    let doc = (http get -H {User-Agent: $REDDIT_UA} $url)
    $doc.data.children | each {|child| $child.data | reddit_post_row }
}

# Search Reddit posts within a subreddit or site-wide
export def "prim-reddit-search" [
    --query:     string = ""          # Search query (required)
    --subreddit: string = "all"       # Subreddit to search, or 'all' for site-wide
    --sort:      string = "relevance" # Sort: relevance top new
    --time:      string = "week"      # Time window: hour day week month year all
    --limit:     string = "25"        # Max posts to return (1–100)
]: nothing -> table {
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let q   = ($query | url encode)
    let url = if $subreddit == "all" {
        $"($REDDIT_BASE)/search.json?q=($q)&sort=($sort)&t=($time)&limit=($cap)"
    } else {
        $"($REDDIT_BASE)/r/($subreddit)/search.json?q=($q)&restrict_sr=1&sort=($sort)&t=($time)&limit=($cap)"
    }
    let doc = (http get -H {User-Agent: $REDDIT_UA} $url)
    $doc.data.children | each {|child| $child.data | reddit_post_row }
}

# Fetch top-level comments for a Reddit post
export def "prim-reddit-comments" [
    --post_id:   string = ""   # Post ID (id field from subreddit/search output) — wirable
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
    # doc is a 2-element list: [0] post listing, [1] comments listing
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
