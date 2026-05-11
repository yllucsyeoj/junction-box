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
    http get $url | from xml | get content | where tag == "entry" | first $n | each {|entry|
        let c = $entry.content
        let authors = ($c | where tag == "author" | each {|a| $a.content | where tag == "name" | first | $in.content.0.content | into string} | str join ", ")
        {
            id: (try { $c | where tag == "id" | first | $in.content.0.content | into string | str replace "http://" "https://" } catch { "" })
            title: (try { $c | where tag == "title" | first | $in.content.0.content | into string | str trim } catch { "" })
            authors: $authors
            published: (try { $c | where tag == "published" | first | $in.content.0.content | into string } catch { "" })
            summary: (try { $c | where tag == "summary" | first | $in.content.0.content | into string | str trim | str substring 0..500 } catch { "" })
            link: (try { $c | where tag == "link" | first | $in.attributes.href | into string } catch { "" })
        }
    }
}