use _shared.nu *
# Fetch metadata for a single YouTube video via oEmbed. Accepts a bare video ID or full YouTube URL. Returns a record with video_id, title, author, channel_url, thumbnail_url.
@category youtube
export def "prim-youtube-video" [
    --video_id: string = ""   # [wirable] Bare video ID (dQw4w9WgXcQ) or full YouTube URL
]: nothing -> record {
    if ($video_id | is-empty) {
        error make {msg: "provide --video_id as a bare ID or full YouTube URL"}
    }
    let vid = (yt_normalize_id $video_id)
    let url = ({
        scheme: "https",
        host: "www.youtube.com",
        path: "/oembed",
        params: {
            url: $"https://www.youtube.com/watch?v=($vid)",
            format: "json"
        }
    } | url join)
    let raw = (http get -H {User-Agent: $YT_UA} $url)
    {
        video_id:      $vid
        title:         (try { $raw.title         } catch { null })
        author:        (try { $raw.author_name   } catch { null })
        channel_url:   (try { $raw.author_url    } catch { null })
        thumbnail_url: (try { $raw.thumbnail_url } catch { null })
    }
}
