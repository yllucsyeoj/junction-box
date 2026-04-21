export def "prim-count" []: table -> int {
    $in | length
