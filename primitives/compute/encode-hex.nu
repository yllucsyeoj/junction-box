# Encode a string to hex
@category compute
export def "prim-encode-hex" []: string -> string {
    $in | encode hex
}
