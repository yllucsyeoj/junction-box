# Percent-encode a string for safe use in a URL
@category compute
export def "prim-url-encode" []: string -> string {
    $in | url encode
}
