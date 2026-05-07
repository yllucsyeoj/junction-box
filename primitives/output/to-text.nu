# Convert any value to a plain text string. Handles primitives directly;
# serializes records, tables, and lists to NUON first so they don't fail.
@category output
export def "prim-to-text" []: any -> string {
    let v = $in
    let desc = ($v | describe)
    if ($desc | str starts-with 'record') or ($desc | str starts-with 'table') or ($desc | str starts-with 'list') {
        $v | to nuon
    } else {
        $v | into string
    }
}
