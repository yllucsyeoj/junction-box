# GoNude YouTube extension
# Nodes: search, channel, playlist, video, transcript
# Sources: YouTube page scraping (search, transcript), Atom RSS (channel, playlist), oEmbed API (video)
# No API keys required.

export const YOUTUBE_PRIMITIVE_META = {
    youtube_search: {
        category: "youtube"
        color: "#ef4444"
        wirable: []
        agent_hint: "Search YouTube for videos matching a query. Returns a table of results with video_id, title, channel, channel_id, published, description, views."
        param_options: {}
    }
    youtube_channel: {
        category: "youtube"
        color: "#ef4444"
        wirable: []
        agent_hint: "Fetch recent videos from a YouTube channel. Accepts a @handle or raw channel ID (UCxxx). Returns a table with video_id, title, published, description, views, channel, channel_id."
        param_options: {}
    }
    youtube_playlist: {
        category: "youtube"
        color: "#ef4444"
        wirable: []
        agent_hint: "Fetch videos from a YouTube playlist by playlist ID. Returns a table with video_id, title, published, description, channel, channel_id."
        param_options: {}
    }
    youtube_video: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["video_id"]
        agent_hint: "Fetch metadata for a single YouTube video via oEmbed. Accepts a bare video ID or full YouTube URL. Returns a record with video_id, title, author, channel_url, thumbnail_url."
        param_options: {}
    }
    youtube_transcript: {
        category: "youtube"
        color: "#ef4444"
        wirable: ["video_id"]
        agent_hint: "Fetch the spoken transcript of a YouTube video as plain text (no timestamps). Accepts a bare video ID or full YouTube URL. Returns a string."
        param_options: {}
    }
}

const YT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
