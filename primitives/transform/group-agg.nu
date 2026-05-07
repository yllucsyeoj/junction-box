# Aggregate a group_by record into a [{group, value}] summary table.
@category transform
export def "prim-group-agg" [
    --column: string = ""            # Column to aggregate within each group
    --op: string = "avg"             # [options:avg,sum,min,max,count,first] Aggregation: avg, sum, min, max, count, first
]: record -> table {
    let groups = $in
    $groups | items {|key, rows|
        let vals = ($rows | get $column)
        let v = match $op {
            "sum"   => { $vals | math sum }
            "min"   => { $vals | math min }
            "max"   => { $vals | math max }
            "avg"   => { $vals | math avg }
            "count" => { $vals | length }
            "first" => { $vals | first }
            _ => { null }
        }
        {group: $key, value: $v}
    }
}
