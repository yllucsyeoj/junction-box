export def "prim-encode-base64" []: string -> string {
    $in | encode base64
