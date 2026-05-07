# Apply a Nu expression to each table row ($in = row record). --as_col adds result as new column; omit to replace the row. IMPORTANT: when using --as_col, the expression must return a scalar (string/number/bool) — returning the whole row record creates a nested column that breaks downstream filter comparisons.
@category compute
export def "prim-row-apply" [
    --expr: string = "$in"           # Nu expression — $in is the current row (record)
    --as_col: string = ""            # If set, store result here; else expression must return a record
]: table -> table {
    let tbl = $in
    $tbl | each {|row|
        let result = (
            nu -c $"(($row | to nuon)) | do { ($expr) } | to nuon"
            | from nuon
        )
        if ($as_col | is-empty) {
            $result
        } else {
            $row | upsert $as_col $result
        }
    }
}
