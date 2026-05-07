# Decode a percent-encoded URL string
@category compute
export def "prim-url-decode" []: string -> string {
    $in | url decode
}
