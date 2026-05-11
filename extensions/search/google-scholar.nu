# Search academic papers via CrossRef API. Returns a table with title, authors, doi, published, publisher, link.
@category search
export def "prim-google-scholar" [
    --query: string = ""       # [wirable][required] Search terms
    --limit: string = "10"     # Max results to return
]: nothing -> table {
    let q = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($q | is-empty) { error make {msg: "provide --query with search terms"} }
    let n = ($limit | into int)
    let url = ({
        scheme: "https",
        host: "api.crossref.org",
        path: "/works",
        params: { query: $q, rows: ($n | into string) }
    } | url join)
    let resp = (http get --raw -H {User-Agent: "junction-box/1.0 (mailto:user@example.com)"} $url | from json)
    $resp.message.items | each {|item|
        let authors = (try { $item.author | each {|a| $"($a.given) ($a.family)"} | str join ", " } catch { "" })
        let doi = (try { $item.DOI } catch { "" })
        let date_parts = (try { $item.created.date-parts | first } catch { [] })
        let pub_year = (try { $date_parts | get 0 } catch { "" })
        let pub_month = (try { $date_parts | get 1 } catch { "01" })
        let pub_day = (try { $date_parts | get 2 } catch { "01" })
        {
            title: (try { $item.title | first } catch { "" })
            authors: $authors
            doi: $doi
            published: $"($pub_year)-($pub_month)-($pub_day)"
            publisher: (try { $item.publisher } catch { "" })
            link: (if $doi != "" {$"https://doi.org/($doi)"} else { "" })
        }
    }
}