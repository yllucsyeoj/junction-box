use _shared.nu *
# Fetch recent videos from a YouTube channel. Accepts a @handle or raw channel ID (UCxxx). Returns a table with video_id, title, published, description, views, channel, channel_id.
@category youtube
export def "prim-youtube-channel" [
    --channel: string = ""   # [wirable][required] @handle (e.g. @mkbhd) or raw channel ID (UCxxx)
    --limit:   string = "15" # Max number of videos to return
]: nothing -> table {
    let channel_val = if ($channel | str starts-with '"') { try { $channel | from json } catch { $channel } } else { $channel }
    if ($channel_val | is-empty) {
        error make {msg: "provide --channel as a @handle or UCxxx channel ID"}
    }

    let channel_id = if ($channel_val | str starts-with "@") {
        let html  = (http get -H {User-Agent: $YT_UA} $"https://www.youtube.com/($channel_val)")
        let match = ($html | parse --regex '"channelId":"(UC[a-zA-Z0-9_-]+)"')
        if ($match | is-empty) {
            error make {msg: $"Could not resolve channel ID for ($channel_val) — handle may not exist"}
        }
        $match | first | get capture0
    } else {
        $channel_val
    }

    yt_parse_rss $"https://www.youtube.com/feeds/videos.xml?channel_id=($channel_id)" ($limit | into int)
}
