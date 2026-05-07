# Rolling N-row window aggregate over a table column. Adds a rolling result column.
@category transform
export def "prim-window" [
    --column: string = ""            # Column to aggregate
    --size: string = "3"             # Window size (number of rows)
    --op: string = "avg"             # [options:avg,sum,min,max] Operation: avg, sum, min, max
    --as_col: string = ""            # Output column name (default: rolling_{op}_{column})
]: table -> table {
    let n = ($size | into int)
    let out_col = if ($as_col | is-empty) { $"rolling_($op)_($column)" } else { $as_col }
    let tbl = $in
    let len = ($tbl | length)
    mut rows = []
    for i in 0..<$len {
        let raw = $i - $n + 1
        let start = if $raw < 0 { 0 } else { $raw }
        let window = ($tbl | skip $start | first ($i - $start + 1) | get $column)
        let v = match $op {
            "sum" => { $window | math sum }
            "min" => { $window | math min }
            "max" => { $window | math max }
            _ =>     { $window | math avg }
        }
        $rows = ($rows | append [($tbl | get $i | upsert $out_col $v)])
    }
    $rows
}
