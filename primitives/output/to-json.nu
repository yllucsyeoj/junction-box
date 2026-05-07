# Serialize any value to a JSON string
@category output
export def "prim-to-json" []: any -> string { $in | to json }
