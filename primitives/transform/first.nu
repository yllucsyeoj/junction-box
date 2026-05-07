# Return the first N rows of a table (default N=1). Returns a table — use 'get' to extract a field from the result.
@category transform
export def "prim-first" [
    --n: string = "1"              # Number of rows to return (default: 1)
]: table -> table {
    $in | first ($n | into int)
}
