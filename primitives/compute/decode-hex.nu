export def "prim-decode-hex" []: string -> string {
    $in | decode hex | decode
