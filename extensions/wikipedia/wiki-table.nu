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
    let t   = ($title_val | url encode)
    let url = $"($WIKI_API)?action=parse&page=($t)&prop=wikitext&section=($section | into int)&format=json"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.wikitext | values | first | wiki_parse_table
}
