#!/usr/bin/env nu
# Standalone introspection tool — outputs JSON node spec for core primitives.
# Run from project root: nu scripts/introspect.nu
#
# Note: the server (spec.ts) generates the full Nu script dynamically to include
# extensions/, since Nu's `use` requires compile-time paths. This script covers
# core primitives only (no extensions).

use ../primitives/compute/decode-base64.nu *
use ../primitives/compute/decode-hex.nu *
use ../primitives/compute/each.nu *
use ../primitives/compute/encode-base64.nu *
use ../primitives/compute/encode-hex.nu *
use ../primitives/compute/from-string.nu *
use ../primitives/compute/hash.nu *
use ../primitives/compute/into-duration.nu *
use ../primitives/compute/into-filesize.nu *
use ../primitives/compute/math-fn.nu *
use ../primitives/compute/math.nu *
use ../primitives/compute/row-apply.nu *
use ../primitives/compute/str-concat.nu *
use ../primitives/compute/str-interp.nu *
use ../primitives/compute/string-op.nu *
use ../primitives/compute/type-cast.nu *
use ../primitives/compute/url-decode.nu *
use ../primitives/compute/url-encode.nu *
use ../primitives/datetime/date-add.nu *
use ../primitives/datetime/date-format.nu *
use ../primitives/datetime/date-now.nu *
use ../primitives/datetime/into-datetime.nu *
use ../primitives/datetime/list-timezone.nu *
use ../primitives/datetime/to-timezone.nu *
use ../primitives/external/analyze.nu *
use ../primitives/external/http-delete.nu *
use ../primitives/external/http-head.nu *
use ../primitives/external/http-patch.nu *
use ../primitives/external/http-post.nu *
use ../primitives/external/http-put.nu *
use ../primitives/external/llm.nu *
use ../primitives/file/glob.nu *
use ../primitives/file/ls.nu *
use ../primitives/file/mkdir.nu *
use ../primitives/file/path-join.nu *
use ../primitives/file/path-parse.nu *
use ../primitives/file/rm.nu *
use ../primitives/input/const.nu *
use ../primitives/input/env.nu *
use ../primitives/input/fetch.nu *
use ../primitives/input/file-in.nu *
use ../primitives/logic/catch.nu *
use ../primitives/logic/for.nu *
use ../primitives/logic/if.nu *
use ../primitives/logic/match.nu *
use ../primitives/logic/try.nu *
use ../primitives/logic/while.nu *
use ../primitives/output/display.nu *
use ../primitives/output/file-out.nu *
use ../primitives/output/return.nu *
use ../primitives/output/to-csv.nu *
use ../primitives/output/to-json.nu *
use ../primitives/output/to-nuon.nu *
use ../primitives/output/to-text.nu *
use ../primitives/transform/append.nu *
use ../primitives/transform/batch.nu *
use ../primitives/transform/chunk-by.nu *
use ../primitives/transform/col-stats.nu *
use ../primitives/transform/col-to-list.nu *
use ../primitives/transform/columns.nu *
use ../primitives/transform/compact.nu *
use ../primitives/transform/count.nu *
use ../primitives/transform/drop.nu *
use ../primitives/transform/enumerate.nu *
use ../primitives/transform/filter.nu *
use ../primitives/transform/find.nu *
use ../primitives/transform/first.nu *
use ../primitives/transform/flatten.nu *
use ../primitives/transform/get.nu *
use ../primitives/transform/group-agg.nu *
use ../primitives/transform/group-by.nu *
use ../primitives/transform/insert-row.nu *
use ../primitives/transform/items.nu *
use ../primitives/transform/join.nu *
use ../primitives/transform/last.nu *
use ../primitives/transform/map.nu *
use ../primitives/transform/merge.nu *
use ../primitives/transform/move.nu *
use ../primitives/transform/null-fill.nu *
use ../primitives/transform/reduce.nu *
use ../primitives/transform/reject.nu *
use ../primitives/transform/rename.nu *
use ../primitives/transform/reverse.nu *
use ../primitives/transform/row.nu *
use ../primitives/transform/select.nu *
use ../primitives/transform/sort.nu *
use ../primitives/transform/summarize.nu *
use ../primitives/transform/table-concat.nu *
use ../primitives/transform/transpose.nu *
use ../primitives/transform/uniq.nu *
use ../primitives/transform/update.nu *
use ../primitives/transform/values.nu *
use ../primitives/transform/window.nu *
use ../primitives/transform/wrap.nu *
use ../primitives/transform/zip.nu *

let cmds = (scope commands | where name =~ '^prim-' | where type == 'custom')

let category_colors = {
    input: "#f97316", transform: "#3b82f6", compute: "#eab308",
    logic: "#ec4899", output: "#22c55e", external: "#a855f7",
    file: "#f97316", datetime: "#06b6d4"
}

let specs = ($cmds | each {|cmd|
    let category = if ($cmd.category | is-not-empty) { $cmd.category } else { "other" }
    let color = ($category_colors | get -o $category | default "#6b7280")
    let agent_hint = ($cmd.description | default "")

    let sig_rows = ($cmd.signatures | transpose key val | first | get val)
    let in_type = ($sig_rows | where parameter_type == 'input' | first | get syntax_shape | default 'any')
    let out_type = ($sig_rows | where parameter_type == 'output' | first | get syntax_shape | default 'any')

    let params = ($sig_rows
        | where parameter_type == 'named'
        | where parameter_name != 'help'
        | each {|p|
            let desc = ($p.description | default '')
            let wirable = ($desc | str contains '[wirable]')
            let required = ($desc | str contains '[required]') or (not $p.is_optional)
            let opts_m = ($desc | parse --regex '\[options:(?P<o>[^\]]+)\]')
            let options = if ($opts_m | is-empty) { null } else { $opts_m | first | get o | split row ',' }
            let fmt_m = ($desc | parse --regex '\[format:(?P<f>[^\]]+)\]')
            let fmt = if ($fmt_m | is-empty) { null } else { $fmt_m | first | get f }
            let clean_desc = ($desc | str replace --all --regex '\[[^\]]*\]' '' | str trim)
            let base = { name: $p.parameter_name, type: ($p.syntax_shape | default 'string'),
                         required: $required, wirable: $wirable, description: $clean_desc }
            let base = if $options != null { $base | insert options $options } else { $base }
            if $fmt != null { $base | insert format $fmt } else { $base }
        })

    {
        name: ($cmd.name | str replace 'prim-' '')
        category: $category
        color: $color
        agent_hint: $agent_hint
        description: ($cmd.description | default "")
        ports: {
            inputs: [{name: "input", type: $in_type}]
            outputs: [{name: "output", type: $out_type}]
        }
        params: $params
    }
})

$specs | to json
