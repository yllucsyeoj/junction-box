# Extract the values of a record as a list (complement to columns).
@category transform
export def "prim-values" []: record -> list {
    $in | values
}
