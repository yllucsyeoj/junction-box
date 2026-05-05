# GoNude Wikipedia extension
# Nodes: search, summary, sections, section, table
# Source: Wikipedia REST API + MediaWiki API — no auth required

export const WIKIPEDIA_PRIMITIVE_META = {
    wiki_search: {
        category: "wikipedia"
        color: "#6b7280"
        wirable: ["query"]
        required_params: ["query"]
        agent_hint: "Search Wikipedia for articles matching a query. Returns a table with title, snippet, pageid. Use to find the exact page title before calling wiki_summary or wiki_sections."
        param_options: {}
    }
    wiki_summary: {
        category: "wikipedia"
        color: "#6b7280"
        wirable: ["title"]
        agent_hint: "Fetch the intro summary of a Wikipedia article. Returns a record with title, description (one-liner), extract (2-5 sentence summary). Wire title from wiki_search output for dynamic lookup."
        param_options: {}
    }
    wiki_sections: {
        category: "wikipedia"
        color: "#6b7280"
        wirable: ["title"]
        agent_hint: "Fetch the table of contents for a Wikipedia article. Returns a table with index, title, level. Use to discover available sections before calling wiki_section or wiki_table."
        param_options: {}
    }
    wiki_section: {
        category: "wikipedia"
        color: "#6b7280"
        wirable: ["title"]
        agent_hint: "Fetch a specific section of a Wikipedia article as plain text. Provide section index from wiki_sections (0 = intro/lead). Returns a string suitable for LLM input."
        param_options: {}
    }
    wiki_table: {
        category: "wikipedia"
        color: "#6b7280"
        wirable: ["title"]
        agent_hint: "Parse the first wikitable in a Wikipedia section into a Nu table. Provide section index from wiki_sections. Best for structured data sections like Finances, Demographics, Statistics."
        param_options: {}
    }
}

const WIKI_UA   = "Mozilla/5.0 (compatible; junction-box-wikipedia/1.0)"
const WIKI_API  = "https://en.wikipedia.org/w/api.php"
const WIKI_REST = "https://en.wikipedia.org/api/rest_v1"

# ── Private helpers ───────────────────────────────────────────────────────────

# Strip wiki markup from a cell value — removes refs, templates, HTML, link brackets
def wiki_cell_clean []: string -> string {
    $in
    | str replace --all --regex '<ref[^>]*/>' ''
    | str replace --all --regex '<ref[^>]*>[^<]*</ref>' ''
    | str replace --all --regex '\{\{[^{}]*\}\}' ''
    | str replace --all --regex '<br\s*/?>' ' '
    | str replace --all --regex '<[^>]+>' ''
    | str replace --all "'''" ''
    | str replace --all "''" ''
    | str replace --all --regex '\[\[[^\]|]*\|([^\]]*)\]\]' '$1'
    | str replace --all --regex '\[\[([^\]]*)\]\]' '$1'
    | str trim
}

# Strip wiki markup from section prose text
def wiki_text_clean []: string -> string {
    $in
    | str replace --all --regex '<ref[^>]*/>' ''
    | str replace --all --regex '<ref[^>]*>[^<]*</ref>' ''
    | str replace --all --regex '\{\{[^{}]*\}\}' ''
    | str replace --all --regex '\{\{[^{}]*\}\}' ''
    | str replace --all --regex '<br\s*/?>' "\n"
    | str replace --all --regex '<[^>]+>' ''
    | str replace --all "'''" ''
    | str replace --all "''" ''
    | str replace --all --regex '\[\[File:[^\]]*\]\]' ''
    | str replace --all --regex '\[\[[^\]|]*\|([^\]]*)\]\]' '$1'
    | str replace --all --regex '\[\[([^\]]*)\]\]' '$1'
    | str replace --all --regex '\{\|[^\n]*' ''
    | str replace --all '|}' ''
    | str replace --all --regex '\|-+' ''
    | str replace --all --regex '^\s*[|!][^|\n]*\|' ''
    | str replace --all --regex '^[ \t]*[|!]' ''
    | str replace --all --regex "\n\n\n+" "\n\n"
    | str trim
}

# Extract the text value from a single wikitext cell line
def wiki_cell_value []: string -> string {
    let s = ($in | str trim)
    # "! scope="row" |text" or "| attr | text" → take after last |
    if ($s | str contains "|") {
        $s | split row "|" | last | str trim | wiki_cell_clean
    } else {
        # Plain "!Header" — strip leading ! or |
        $s | str replace --regex '^[!|]' '' | str trim | wiki_cell_clean
    }
}

# Parse the first wikitable in wikitext into a Nu table
def wiki_parse_table []: string -> table {
    let wikitext = $in
    let t_start  = ($wikitext | str index-of "{|")
    let t_end    = ($wikitext | str index-of "|}")
    if $t_start == -1 or $t_end == -1 { return [] }

    let inner = ($wikitext | str substring $t_start..($t_end + 2))

    # Split on row separators — must use double-quoted string for real \n
    let segments = ($inner | split row "\n|-")

    # Headers: ! lines in the first segment that are NOT row-header cells
    let headers = ($segments | first | lines
        | where {|l|
            let t = ($l | str trim)
            ($t | str starts-with "!") and not ($t | str contains "scope=")
        }
        | each {|l|
            $l | str trim | str replace --regex '^!' '' | str trim | wiki_cell_clean
        })

    if ($headers | is-empty) { return [] }

    # Data rows: all segments after the first, extract cell lines
    let h = $headers
    $segments | skip 1 | each {|seg|
        let cells = ($seg | lines
            | where {|l|
                let t = ($l | str trim)
                let is_cell    = (($t | str starts-with "!") or ($t | str starts-with "|"))
                let not_close  = not ($t | str starts-with "|}")
                let not_open   = not ($t | str starts-with "{|")
                let not_caption = not ($t | str starts-with "|+")
                $is_cell and $not_close and $not_open and $not_caption
            }
            | each {|l|
                let t = ($l | str trim)
                if ($t | str contains "||") {
                    # Inline multi-cell: "| a || b || c"
                    $t | str replace --regex '^[|!]' '' | split row "||" | each {|c| $c | str trim | wiki_cell_clean}
                } else {
                    [($t | wiki_cell_value)]
                }
            }
            | flatten
            | where {|v| ($v | str length) > 0})

        if ($cells | is-empty) { return null }

        $cells | enumerate | reduce --fold {} {|item, acc|
            let col = (try { $h | get $item.index } catch { $"col_($item.index)" })
            $acc | upsert $col $item.item
        }
    }
    | where {|r| $r != null}
}

# ── Primitives ────────────────────────────────────────────────────────────────

# Search Wikipedia for articles matching a query
export def "prim-wiki-search" [
    --query: string = ""  # Search terms (required)
    --limit: string = "5" # Max results to return
]: nothing -> table {
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }
    let q   = ($query_val | url encode)
    let url = $"($WIKI_API)?action=query&list=search&srsearch=($q)&srlimit=($limit | into int)&format=json"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.query.search | each {|r|
        {
            title:   $r.title
            snippet: ($r.snippet | str replace --all --regex '<[^>]+>' '' | str replace --all "&quot;" '"' | str trim)
            pageid:  $r.pageid
        }
    }
}

# Fetch the intro summary of a Wikipedia article
export def "prim-wiki-summary" [
    --title: string = ""  # Wikipedia article title (e.g. "Nvidia") — wirable
]: nothing -> record {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let t   = ($title_val | url encode)
    let url = $"($WIKI_REST)/page/summary/($t)"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    {
        title:       (try { $doc.title       } catch { "" })
        description: (try { $doc.description } catch { "" })
        extract:     (try { $doc.extract     } catch { "" })
    }
}

# Fetch the table of contents for a Wikipedia article
export def "prim-wiki-sections" [
    --title: string = ""  # Wikipedia article title — wirable
]: nothing -> table {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let t   = ($title_val | url encode)
    let url = $"($WIKI_API)?action=parse&page=($t)&prop=sections&format=json"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.sections | each {|s|
        {
            index: ($s.index | into int)
            title: $s.line
            level: ($s.toclevel | into int)
        }
    }
}

# Fetch a specific section of a Wikipedia article as plain text
export def "prim-wiki-section" [
    --title:   string = ""  # Wikipedia article title — wirable
    --section: string = "0" # Section index from wiki_sections (0 = lead/intro)
]: nothing -> string {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let t   = ($title_val | url encode)
    let url = $"($WIKI_API)?action=parse&page=($t)&prop=wikitext&section=($section | into int)&format=json"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.wikitext | values | first | wiki_text_clean
}

# Parse the first wikitable in a Wikipedia section into a Nu table
export def "prim-wiki-table" [
    --title:   string = ""  # Wikipedia article title — wirable
    --section: string = "1" # Section index from wiki_sections
]: nothing -> table {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let t   = ($title_val | url encode)
    let url = $"($WIKI_API)?action=parse&page=($t)&prop=wikitext&section=($section | into int)&format=json"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    $doc.parse.wikitext | values | first | wiki_parse_table
}
