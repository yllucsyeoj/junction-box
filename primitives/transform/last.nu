# Return the last N rows of a table (default N=1).
@category transform
export def "prim-last" [
    --n: string = "1"              # Number of rows to return (default: 1)
]: table -> table {
    $in | last ($n | into int)
}
