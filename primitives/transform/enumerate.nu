# Add a zero-based index field to each element — returns [{index, value}, ...]
@category transform
export def "prim-enumerate" []: any -> table {
    $in | enumerate | each {|it| {index: $it.index, value: $it.item}}
}
