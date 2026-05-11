# Search BBC News website. Returns a table with title, link, description.
@category search
export def "prim-bbc-search" [
    --query: string = ""       # [wirable][required] Search terms
    --limit: string = "10"     # Max results to return
]: nothing -> table {
    let q = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($q | is-empty) { error make {msg: "provide --query with search terms"} }
    let n = ($limit | into int)
    let url = ({
        scheme: "https",
        host: "www.bbc.co.uk",
        path: "/search",
        params: { q: $q, page: "1" }
    } | url join)
    let links = (http get --raw -H {User-Agent: "Mozilla/5.0 (compatible; junction-box-search/1.0)"} $url | query web -q "a.ssrcss-jrq4xn-PromoLink" --as-html)
    let take = ([$n ($links | length)] | math min)
    $links | first $take | each {|html|
        let title = ($html | str replace -r '.*<span[^>]*>([^<]+)<.*' '$1' | str trim)
        let href = ($html | str replace -r '.*href="([^"]+)".*' '$1' | str trim)
        {
            title: $title
            link: $href
            description: ""
        }
    }
}