# GoNude Hacker News extension
# Nodes: search, comments
# Source: Algolia HN Search API (hn.algolia.com) — no auth required

export const HN_PRIMITIVE_META = {
    hn_search: {
        category: "hn"
        color: "#f97316"
        wirable: []
        required_params: ["query"]
        agent_hint: "Search Hacker News stories by keyword via Algolia. type filters to story ask_hn show_hn front_page. sort: relevance or date. Returns a table with id, title, author, points, num_comments, created_at, url."
        param_options: {
            sort: ["relevance", "date"]
            type: ["story", "ask_hn", "show_hn", "front_page"]
        }
    }
    hn_comments: {
        category: "hn"
        color: "#f97316"
        wirable: []
        required_params: ["query"]
        agent_hint: "Search Hacker News comment text by keyword via Algolia. Best for sentiment — what is HN actually saying about a company or topic. Returns a table with id, author, body, points, story_id, story_title, story_url, created_at."
        param_options: {
            sort: ["relevance", "date"]
        }
    }
}

const HN_UA = "Mozilla/5.0 (compatible; junction-box-hn/1.0)"

# ── Private helpers ───────────────────────────────────────────────────────────

# Decode HTML entities common in Algolia HN comment text
def hn_decode []: string -> string {
    $in
    | str replace --all "&amp;"   "&"
    | str replace --all "&lt;"    "<"
    | str replace --all "&gt;"    ">"
    | str replace --all "&#x2F;"  "/"
    | str replace --all "&#x27;"  "'"
    | str replace --all "&#39;"   "'"
    | str replace --all "&quot;"  '"'
    | str replace --all "&#34;"   '"'
    | str replace --all "<p>"     "\n"
}

# ── Primitives ────────────────────────────────────────────────────────────────

# Search Hacker News stories by keyword
export def "prim-hn-search" [
    --query: string = ""         # Search terms (required)
    --sort:  string = "relevance" # Sort: relevance or date
    --type:  string = "story"    # Filter: story ask_hn show_hn front_page
    --limit: string = "20"       # Max results to return
]: nothing -> table {
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query | url encode)
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

# Search Hacker News comment text by keyword
export def "prim-hn-comments" [
    --query: string = ""          # Search terms (required)
    --sort:  string = "relevance" # Sort: relevance or date
    --limit: string = "20"        # Max results to return
]: nothing -> table {
    if ($query | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let endpoint = if $sort == "date" { "search_by_date" } else { "search" }
    let q        = ($query | url encode)
    let url      = $"https://hn.algolia.com/api/v1/($endpoint)?query=($q)&tags=comment&hitsPerPage=($limit | into int)"
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
