export def "prim-items" []: record -> table {
    $in | items {|key, value| {key: $key, value: $value}}
