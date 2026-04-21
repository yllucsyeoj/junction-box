export def "prim-url-decode" []: string -> string {
    $in | url decode
