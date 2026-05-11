# Search arXiv e-print repository via OAI-PMH API. Returns a table with id, title, authors, published, summary, link.
@category search
export def "prim-arxiv-search" [
    --query: string = ""       # [wirable][required] Search terms
    --limit: string = "10"     # Max results to return
]: nothing -> table {
    let q = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($q | is-empty) { error make {msg: "provide --query with search terms"} }
    let n = ($limit | into int)
    let url = ({
        scheme: "https",
        host: "export.arxiv.org",
        path: "/api/query",
        params: {
            search_query: $"all:($q)",
            start: "0",
            max_results: ($n | into string)
        }
    } | url join)
    let raw = (http get -H {User-Agent: "junction-box/1.0"} $url)
    let chunks = ($raw | split row "<entry>" | skip 1 | first $n)
    $chunks | each {|c|
        {
            id: (try { $c | str replace -r '[\s\S]*<id[^>]*>(.+?)</id>[\s\S]*' '$1' | str trim } catch { "" })
            title: (try { $c | str replace -r '[\s\S]*<title[^>]*>(.+?)</title>[\s\S]*' '$1' | str trim } catch { "" })
            authors: (try { $c | split row "<author>" | skip 1 | each {|a| $a | str replace -r '[\s\S]*<name[^>]*>(.+?)</name>[\s\S]*' '$1' | str trim} | str join ", " } catch { "" })
            published: (try { $c | str replace -r '[\s\S]*<published[^>]*>(.+?)</published>[\s\S]*' '$1' | str trim } catch { "" })
            summary: (try { $c | str replace -r '[\s\S]*<summary[^>]*>(.+?)</summary>[\s\S]*' '$1' | str trim | str substring 0..500 } catch { "" })
            link: (try { $c | str replace -r '[\s\S]*<link[^>]*href="([^"]+)"[^>]*/>[\s\S]*' '$1' | str trim } catch { "" })
        }
    }
}