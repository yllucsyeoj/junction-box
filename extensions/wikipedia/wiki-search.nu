use _shared.nu *
# Search Wikipedia for articles matching a query. Returns a table with title, snippet, pageid. Use to find the exact page title before calling wiki_summary or wiki_sections.
@category wikipedia
export def "prim-wiki-search" [
    --query: string = ""  # [wirable][required] Search terms
    --limit: string = "5" # Max results to return
]: nothing -> table {
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let url = ({
        scheme: "https",
        host: "en.wikipedia.org",
        path: "/w/api.php",
        params: { action: "query", list: "search", srsearch: $query_val, srlimit: ($limit | into int | into string), format: "json" }
    } | url join)
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.query.search | each {|r|
        {
            title:   $r.title
            snippet: ($r.snippet | str replace --all --regex '<[^>]+>' '' | str replace --all "&quot;" '"' | str trim)
            pageid:  $r.pageid
        }
    }
}
