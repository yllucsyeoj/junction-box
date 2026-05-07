# Decode a base64 string to plain text
@category compute
export def "prim-decode-base64" []: string -> string {
    $in | decode base64 | decode
}
