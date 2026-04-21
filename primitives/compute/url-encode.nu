export def "prim-url-encode" []: string -> string {
    $in | url encode
