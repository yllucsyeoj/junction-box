# Get a row at a specific index from a table.
@category transform
export def "prim-row" [
    --index: string = "0"             # 0-based row index to retrieve
]: table -> record {
    $in | get ($index | into int)
}
