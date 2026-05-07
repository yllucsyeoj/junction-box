# Transpose a table (rows become columns) or convert a record to a [{column, value}] table.
@category transform
export def "prim-transpose" []: any -> any {
    $in | transpose
}
