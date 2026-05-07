# Encode a string to base64
@category compute
export def "prim-encode-base64" []: string -> string {
    $in | encode base64
}
