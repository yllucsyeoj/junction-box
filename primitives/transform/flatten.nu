# Flatten one level of nesting from a list of lists
@category transform
export def "prim-flatten" []: list -> list {
    $in | flatten
}
