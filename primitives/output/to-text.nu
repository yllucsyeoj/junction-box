# Convert any value to a plain text string (into string)
@category output
export def "prim-to-text" []: any -> string { $in | into string }
