use _shared.nu *
# Fetch the spoken transcript of a YouTube video as plain text (no timestamps). Accepts a bare video ID or full YouTube URL. Returns a string.
@category youtube
export def "prim-youtube-transcript" [
    --video_id: string = ""    # [wirable][required] Bare video ID or full YouTube URL
    --lang:     string = "en"  # Caption language code (e.g. en, es, fr)
]: nothing -> string {
    if ($video_id | is-empty) {
        error make {msg: "provide --video_id as a bare ID or full YouTube URL"}
    }
    let vid  = (yt_normalize_id $video_id)

    let page     = (http get -H {User-Agent: $YT_UA Accept-Language: "en-US,en;q=0.9"} $"https://www.youtube.com/watch?v=($vid)")
    let key_hits = ($page | parse --regex '"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"')
    if ($key_hits | is-empty) {
        error make {msg: $"Could not extract InnerTube API key for video ($vid) — YouTube structure may have changed"}
    }
    let api_key  = ($key_hits | first | get capture0)

    let body_json = ({
        context: {client: {clientName: "ANDROID", clientVersion: "20.10.38"}}
        videoId: $vid
    } | to json)
    let player = (http post -H {
        User-Agent:   $YT_UA
        Accept-Language: "en-US,en;q=0.9"
        Content-Type: "application/json"
    } $"https://www.youtube.com/youtubei/v1/player?key=($api_key)" $body_json)

    let tracks = (try {
        $player | get captions.playerCaptionsTracklistRenderer.captionTracks
    } catch {
        error make {msg: $"No captions available for video ($vid). The video may not have subtitles."}
    })

    if ($tracks | is-empty) {
        error make {msg: $"No caption tracks found for video ($vid)."}
    }

    let manual_match = ($tracks | where {|t| ($t | get languageCode? | default "") == $lang and ($t | get kind? | default "") != "asr"})
    let asr_match    = ($tracks | where {|t| ($t | get languageCode? | default "") == $lang and ($t | get kind? | default "") == "asr"})
    let track = if not ($manual_match | is-empty) {
        $manual_match | first
    } else if not ($asr_match | is-empty) {
        $asr_match | first
    } else {
        $tracks | first
    }

    let caption_url = (try { $track | get baseUrl } catch {
        error make {msg: $"Could not get caption URL for video ($vid)"}
    })

    let doc = (http get -H {User-Agent: $YT_UA Accept-Language: "en-US,en;q=0.9"} $caption_url)

    let body_el = (try {
        $doc.content | where {|n| ($n | get tag? | default "") == "body"} | first
    } catch {
        error make {msg: $"Could not find body element in caption XML for video ($vid)"}
    })

    let p_nodes = ($body_el.content | where {|node| ($node | get tag? | default "") == "p"})
    if ($p_nodes | is-empty) {
        error make {msg: $"No transcript segments found in caption XML for video ($vid)"}
    }

    $p_nodes
    | each {|node| $node | yt_xml_text | str trim}
    | where {|s| ($s | str length) > 0}
    | str join " "
    | str replace --all "&amp;"  "&"
    | str replace --all "&lt;"   "<"
    | str replace --all "&gt;"   ">"
    | str replace --all "&#39;"  "'"
    | str replace --all "&quot;" "\""
    | str replace --all "&#34;"  "\""
}
