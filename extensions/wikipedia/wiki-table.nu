use _shared.nu *
# Parse the first wikitable in a Wikipedia section into a Nu table. Provide section index from wiki_sections. Best for structured data sections like Finances, Demographics, Statistics.
@category wikipedia
export def "prim-wiki-table" [
    --title:   string = ""  # [wirable] Wikipedia article title
    --section: string = "1" # Section index from wiki_sections
]: nothing -> table {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let url = ({
        scheme: "https",
        host: "en.wikipedia.org",
        path: "/w/api.php",
        params: { action: "parse", page: $title_val, prop: "wikitext", section: ($section | into int | into string), format: "json" }
    } | url join)
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.wikitext | values | first | wiki_parse_table
}
