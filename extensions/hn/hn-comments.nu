use _shared.nu *
# Search Hacker News comment text by keyword via Algolia. Best for sentiment — what is HN actually saying about a company or topic. Returns a table with id, author, body, points, story_id, story_title, story_url, created_at.
@category hn
export def "prim-hn-comments" [
    --query: string = ""          # [wirable][required] Search terms
    --sort:  string = "relevance" # [options:relevance,date] Sort order
    --limit: string = "20"        # Max results to return
]: nothing -> table {
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let url = ({
        scheme: "https",
        host: "hn.algolia.com",
        path: $"/api/v1/($endpoint)",
        params: {
            query: $query_val,
            tags: "comment",
            hitsPerPage: ($limit | into int | into string)
        }
    } | url join)
    let doc      = (http get -H {User-Agent: $HN_UA} $url)
    $doc.hits | each {|h|
        {
            id:          (try { $h.objectID    } catch { "" })
            author:      (try { $h.author      } catch { "" })
            body:        (try { $h.comment_text | hn_decode } catch { "" })
            points:      (try { $h.points      } catch { 0 })
            story_id:    (try { $h.story_id    } catch { "" })
            story_title: (try { $h.story_title } catch { "" })
            story_url:   (try { $h.story_url   } catch { "" })
            created_at:  (try { $h.created_at  } catch { "" })
        }
    }
}
