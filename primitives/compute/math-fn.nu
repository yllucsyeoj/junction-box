# Apply a math function: round/floor/ceil/abs on a number, or sum/min/max/avg/sqrt/median/stddev on a list or table column
@category compute
export def "prim-math-fn" [
    --op: string = "round"           # [options:round,floor,ceil,abs,sum,min,max,avg,sqrt,median,stddev] Operation: round, floor, ceil, abs, sum, min, max, avg
    --column: string = ""            # Column name (for table input — extracts column first)
]: any -> any {
    let data = if ($column | is-not-empty) { $in | get $column } else { $in }
    match $op {
        "round" => { $data | math round }
        "floor" => { $data | math floor }
        "ceil"  => { $data | math ceil }
        "abs"   => { $data | math abs }
        "sum"   => { $data | math sum }
        "min"   => { $data | math min }
        "max"   => { $data | math max }
        "avg"   => { $data | math avg }
        "sqrt"  => { $data | math sqrt }
        "median" => { $data | math median }
        "stddev" => { $data | math stddev }
        _ => { error make {msg: $"Unknown math fn: ($op). Valid: round, floor, ceil, abs, sum, min, max, avg, sqrt, median, stddev"} }
    }
}
