export def "prim-decode-base64" []: string -> string {
    $in | decode base64 | decode
