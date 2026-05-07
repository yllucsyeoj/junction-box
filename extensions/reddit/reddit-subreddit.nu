use _shared.nu *
# Fetch posts from a Reddit subreddit. Returns a table with id, title, author, score, upvote_ratio, num_comments, url, permalink, selftext, created_utc, flair.
@category reddit
export def "prim-reddit-subreddit" [
    --subreddit: string = "wallstreetbets" # [wirable] Subreddit name without r/
    --sort:      string = "hot"            # [options:hot,new,top,rising] Sort order
    --time:      string = "day"            # [options:day,week,month,year,hour,all] Time window (top only)
    --limit:     string = "25"             # Max posts to return (1–100)
]: nothing -> table {
    let subreddit_val = if ($subreddit | str starts-with '"') { try { $subreddit | from json } catch { $subreddit } } else { $subreddit }
    let n   = ($limit | into int)
    let cap = (if $n > 100 { 100 } else { $n })
    let url = if $sort == "top" {
        $"($REDDIT_BASE)/r/($subreddit_val)/top.json?limit=($cap)&t=($time)"
    } else {
        $"($REDDIT_BASE)/r/($subreddit_val)/($sort).json?limit=($cap)"
    }
    let doc = (http get -H {User-Agent: $REDDIT_UA} $url)
    $doc.data.children | each {|child| $child.data | reddit_post_row }
}
