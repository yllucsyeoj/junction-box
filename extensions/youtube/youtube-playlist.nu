use _shared.nu *
# Fetch videos from a YouTube playlist by playlist ID. Returns a table with video_id, title, published, description, channel, channel_id.
@category youtube
export def "prim-youtube-playlist" [
    --playlist_id: string = ""   # [wirable][required] YouTube playlist ID (e.g. PLbpi6ZahtOH6...)
    --limit:       string = "25" # Max number of videos to return
]: nothing -> table {
    let playlist_id_val = if ($playlist_id | str starts-with '"') { try { $playlist_id | from json } catch { $playlist_id } } else { $playlist_id }
    if ($playlist_id_val | is-empty) {
        error make {msg: "provide --playlist_id (the PLxxx string from the playlist URL)"}
    }
    yt_parse_rss $"https://www.youtube.com/feeds/videos.xml?playlist_id=($playlist_id_val)" ($limit | into int)
}
