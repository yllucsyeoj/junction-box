export def "prim-encode-hex" []: string -> string {
    $in | encode hex
