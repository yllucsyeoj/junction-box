# Count the number of rows in a table
@category transform
export def "prim-count" []: table -> int {
    $in | length
}
