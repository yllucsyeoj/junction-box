# Search the iTunes Store for podcasts, music, audiobooks, and more. Returns a table with trackId, artistName, trackName, collectionName, genre, releaseDate, artwork, preview, and url per result.
@category podcast
export def "prim-itunes-search" [
    --term: string = ""        # [wirable][required] Search term (e.g. "hardcore history")
    --media: string = "podcast" # Media type: podcast, music, audiobook, tvShow, movie, ebook, software, all
    --limit: string = "25"     # Max results (1–200)
    --country: string = "US"   # Two-letter country code (e.g. US, GB, CA, AU)
]: nothing -> table {
    let t = if ($term | str starts-with '"') { try { $term | from json } catch { $term } } else { $term }
    if ($t | is-empty) { error make {msg: "provide --term to search iTunes"} }

    let valid_media = ["podcast", "music", "audiobook", "tvShow", "movie", "ebook", "software", "all"]
    if ($media not-in $valid_media) {
        error make {msg: $"media must be one of: ($valid_media | str join ', ')"}
    }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 200] | math min)

    let url = ({
        scheme: "https",
        host: "itunes.apple.com",
        path: "/search",
        params: {term: $t, media: $media, limit: ($clamped | into string), country: $country}
    } | url join)

    let resp = (http get -H {User-Agent: "junction-box/1.0"} $url | from json)
    let results = ($resp.results? | default [])
    if ($results | is-empty) { return [] }

    $results | each {|r|
        {
            trackId:       ($r.trackId? | default null)
            artistName:    ($r.artistName? | default "")
            trackName:     ($r.trackName? | default ($r.collectionName? | default ""))
            collectionName: ($r.collectionName? | default "")
            kind:          ($r.kind? | default ($r.wrapperType? | default ""))
            genre:         ($r.primaryGenreName? | default "")
            releaseDate:   ($r.releaseDate? | default "")
            artwork:       ($r.artworkUrl100? | default ($r.artworkUrl60? | default ""))
            trackPrice:    ($r.trackPrice? | default null)
            previewUrl:    ($r.previewUrl? | default "")
            url:           ($r.trackViewUrl? | default ($r.collectionViewUrl? | default ""))
        }
    }
}