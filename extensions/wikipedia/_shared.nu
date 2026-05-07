export const WIKI_UA   = "Mozilla/5.0 (compatible; junction-box-wikipedia/1.0)"
export const WIKI_API  = "https://en.wikipedia.org/w/api.php"
export const WIKI_REST = "https://en.wikipedia.org/api/rest_v1"

# Strip wiki markup from a cell value — removes refs, templates, HTML, link brackets
export def wiki_cell_clean []: string -> string {
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
export def wiki_text_clean []: string -> string {
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
export def wiki_cell_value []: string -> string {
    let s = ($in | str trim)
    if ($s | str contains "|") {
        $s | split row "|" | last | str trim | wiki_cell_clean
    } else {
        $s | str replace --regex '^[!|]' '' | str trim | wiki_cell_clean
    }
}

# Parse the first wikitable in wikitext into a Nu table
export def wiki_parse_table []: string -> table {
    let wikitext = $in
    let t_start  = ($wikitext | str index-of "{|")
    let t_end    = ($wikitext | str index-of "|}")
    if $t_start == -1 or $t_end == -1 { return [] }

    let inner = ($wikitext | str substring $t_start..($t_end + 2))
    let segments = ($inner | split row "\n|-")

    let headers = ($segments | first | lines
        | where {|l|
            let t = ($l | str trim)
            ($t | str starts-with "!") and not ($t | str contains "scope=")
        }
        | each {|l|
            $l | str trim | str replace --regex '^!' '' | str trim | wiki_cell_clean
        })

    if ($headers | is-empty) { return [] }

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
