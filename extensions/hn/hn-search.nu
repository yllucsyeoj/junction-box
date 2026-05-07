use _shared.nu *
# Search Hacker News stories by keyword via Algolia. type filters to story ask_hn show_hn front_page. sort: relevance or date. Returns a table with id, title, author, points, num_comments, created_at, url.
@category hn
export def "prim-hn-search" [
    --query: string = ""          # [wirable][required] Search terms
    --sort:  string = "relevance" # [options:relevance,date] Sort order
    --type:  string = "story"     # [options:story,ask_hn,show_hn,front_page] Filter type
    --limit: string = "20"        # Max results to return
]: nothing -> table {
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query_val | url encode)
    let url      = $"https://hn.algolia.com/api/v1/($endpoint)?query=($q)&tags=($type)&hitsPerPage=($limit | into int)"
    let doc      = (http get -H {User-Agent: $HN_UA} $url)
    $doc.hits | each {|h|
        {
            id:           (try { $h.objectID     } catch { "" })
            title:        (try { $h.title        } catch { "" })
            author:       (try { $h.author       } catch { "" })
            points:       (try { $h.points       } catch { 0 })
            num_comments: (try { $h.num_comments } catch { 0 })
            created_at:   (try { $h.created_at   } catch { "" })
            url:          (try { $h.url          } catch { "" })
        }
    }
}
