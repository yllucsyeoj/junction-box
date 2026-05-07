# Serialize any value to a NUON string (Nu's native format)
@category output
export def "prim-to-nuon" []: any -> string { $in | to nuon }
