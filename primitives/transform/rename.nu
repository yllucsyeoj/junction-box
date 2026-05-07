# Rename a column: provide old and new column name
@category transform
export def "prim-rename" [
    --from: string = ""            # Current column name
    --to: string = ""              # New column name
]: table -> table {
    $in | rename --column {($from): $to}
}
