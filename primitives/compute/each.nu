# Apply a Nu expression to every element of a list or table row. Use $in for the element/row. e.g. $in * 2 (list) or $in.score * 2 (table).
@category compute
export def "prim-each" [
    --expr: string = "$in"           # Nu expression — use $in for the current element (e.g. $in * 2). For table rows, use $in.fieldname.
]: any -> list {
    $in | each {|it|
        let res = (nu -c $"(($it | to nuon)) | do { ($expr) } | to nuon" | complete)
        if $res.exit_code != 0 {
            error make {msg: $"each expression failed: ($res.stderr | str trim)"}
        }
        $res.stdout | from nuon
    }
}
