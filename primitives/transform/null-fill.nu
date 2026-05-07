# Fill null values in a table column with a NUON constant or forward-fill.
@category transform
export def "prim-null-fill" [
    --column: string = ""            # Column to fill nulls in
    --op: string = "const"           # [options:const,ffill] Strategy: const or ffill
    --value: string = "null"         # [format:nuon] NUON fill value (used when op is const)
]: table -> table {
    let tbl = $in
    let fill = ($value | from nuon)
    if $op == "ffill" {
        $tbl
        | reduce --fold {last: null, rows: []} {|row, acc|
            let v = ($row | get $column)
            let fill_val = if ($v == null) or ($v | is-empty) { $acc.last } else { $v }
            {last: $fill_val, rows: ($acc.rows | append [($row | upsert $column $fill_val)])}
        }
        | get rows
    } else {
        $tbl | upsert $column {|row|
            let v = ($row | get $column)
            if ($v == null) or ($v | is-empty) { $fill } else { $v }
        }
    }
}
