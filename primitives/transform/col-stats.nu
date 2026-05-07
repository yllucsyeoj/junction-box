# Compute count/sum/avg/min/max for a numeric column. Returns a record.
@category transform
export def "prim-col-stats" [
    --column: string = ""            # Column to compute stats on
]: table -> record {
    let col = ($in | get $column)
    {
        count: ($col | length)
        sum:   ($col | math sum)
        avg:   ($col | math avg)
        min:   ($col | math min)
        max:   ($col | math max)
    }
}
