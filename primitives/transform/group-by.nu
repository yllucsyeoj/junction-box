# Group table rows by a column — returns a record keyed by the column values
@category transform
export def "prim-group-by" [
    --column: string = ""            # Column to group by
]: table -> record {
    $in | group-by {|x| $x | get $column}
}
