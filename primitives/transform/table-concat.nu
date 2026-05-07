# Vertically stack two tables (UNION ALL). Wire the second table to --more port.
@category transform
export def "prim-table-concat" [
    --more: string = "[]"            # [wirable][format:nuon] Second table as NUON (wire an edge to this port)
]: table -> table {
    let extra = if (($more | from json | describe) | str starts-with 'list') {
        let tables = ($more | from json | each {|v| $v | from nuon})
        $tables | flatten
    } else {
        ($more | from nuon)
    }
    $in | append $extra
}
