use _shared.nu *
# Fetch a specific section of a Wikipedia article as plain text. Provide section index from wiki_sections (0 = intro/lead). Returns a string suitable for LLM input.
@category wikipedia
export def "prim-wiki-section" [
    --title:   string = ""  # [wirable] Wikipedia article title
    --section: string = "0" # Section index from wiki_sections (0 = lead/intro)
]: nothing -> string {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let t   = ($title_val | url encode)
    let url = $"($WIKI_API)?action=parse&page=($t)&prop=wikitext&section=($section | into int)&format=json"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.wikitext | values | first | wiki_text_clean
}
