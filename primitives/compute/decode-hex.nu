# Decode a hex string to plain text
@category compute
export def "prim-decode-hex" []: string -> string {
    $in | decode hex | decode
}
