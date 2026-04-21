export def "prim-enumerate" []: any -> table {
    $in | enumerate | each {|it| {index: $it.index, value: $it.item}}
