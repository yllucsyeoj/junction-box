# Convert a record to a [{key, value}] table — complement to columns.
@category transform
export def "prim-items" []: record -> table {
    $in | items {|key, value| {key: $key, value: $value}}
}
