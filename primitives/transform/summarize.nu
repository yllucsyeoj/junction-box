# Single-operation aggregate: --col 'price' --op 'sum'. Returns a record of col_op keys. To get multiple aggregations, chain separate summarize nodes — one op per node.
@category transform
export def "prim-summarize" [
    --cols: string = ""              # Comma- or space-separated column names (e.g. "price,volume")
    --ops: string = ""               # [options:avg,sum,min,max,count] Comma- or space-separated ops per column (avg,sum,min,max,count)
]: table -> record {
    let tbl = $in
    let col_list = ($cols | split row --regex '[,\s]+' | where {|c| $c != ""})
    let op_list  = ($ops  | split row --regex '[,\s]+' | where {|o| $o != ""})
    mut result = {}
    for i in 0..<($col_list | length) {
        let col = ($col_list | get $i)
        let op  = ($op_list  | get $i)
        let vals = ($tbl | get $col)
        let v = match $op {
            "avg"   => { $vals | math avg }
            "sum"   => { $vals | math sum }
            "min"   => { $vals | math min }
            "max"   => { $vals | math max }
            "count" => { $vals | length }
            _ => { null }
        }
        $result = ($result | upsert $"($col)_($op)" $v)
    }
    $result
}
