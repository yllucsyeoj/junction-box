# Extract a single column from a table as a flat list.
@category transform
export def "prim-col-to-list" [
    --column: string = ""            # Column name to extract
]: table -> list {
    $in | get $column
}
