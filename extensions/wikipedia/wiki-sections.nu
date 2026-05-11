use _shared.nu *
# Fetch the table of contents for a Wikipedia article. Returns a table with index, title, level. Use to discover available sections before calling wiki_section or wiki_table.
@category wikipedia
export def "prim-wiki-sections" [
    --title: string = ""  # [wirable] Wikipedia article title
]: nothing -> table {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let url = ({
        scheme: "https",
        host: "en.wikipedia.org",
        path: "/w/api.php",
        params: { action: "parse", page: $title_val, prop: "sections", format: "json" }
    } | url join)
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.sections | each {|s|
        {
            index: ($s.index | into int)
            title: $s.line
            level: ($s.toclevel | into int)
        }
    }
}
