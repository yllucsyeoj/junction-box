# Sort a table by a column. direction: asc or desc
@category transform
export def "prim-sort" [
    --column: string = ""        # Column to sort by
    --direction: string = "asc"  # [options:asc,desc] Sort direction: asc or desc
]: table -> table {
    if $direction == "desc" {
        sort-by {|r| $r | get $column} --reverse
    } else {
        sort-by {|r| $r | get $column}
    }
}
