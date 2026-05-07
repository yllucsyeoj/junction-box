# Append a record as a new row to a table. Wire a record source to --row port.
@category transform
export def "prim-insert-row" [
    --row: string = "{}"             # [wirable][format:nuon] Record to append as NUON (wire an edge to this port)
]: table -> table {
    let r = ($row | from nuon)
    $in | append [$r]
}
