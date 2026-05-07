# Group consecutive list elements by a predicate — splits when value changes.
@category transform
export def "prim-chunk-by" [
    --expr: string = "$in"            # Nu expression — $in is current element, should return comparable value
]: list -> list {
    $in | chunk-by {|elem|
        nu -c $"(($elem | to nuon)) | do { ($expr) } | to nuon" | from nuon
    }
}
