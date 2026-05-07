# Get a field from a record or an index from a list. Use --key to specify the field name or index.
@category transform
export def "prim-get" [
    --key: string = ""             # Field name (record) or 0-based integer index (list)
]: any -> any {
    let v = $in
    if ($v | describe | str starts-with 'list') {
        $v | get ($key | into int)
    } else {
        $v | get $key
    }
}
