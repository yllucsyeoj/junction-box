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
    let url = ({
        scheme: "https",
        host: "en.wikipedia.org",
        path: "/w/api.php",
        params: { action: "parse", page: $title_val, prop: "wikitext", section: ($section | into int | into string), format: "json" }
    } | url join)
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.wikitext | values | first | wiki_text_clean
}
