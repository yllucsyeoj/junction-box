# Extract the column names of a table or record as a list.
@category transform
export def "prim-columns" []: any -> list {
    $in | columns
}
