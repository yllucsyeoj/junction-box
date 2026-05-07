# Reduce a list to a single value: sum, product, min, max, avg, or join
@category transform
export def "prim-reduce" [
    --op: string = "sum"             # [options:sum,product,min,max,avg,join] Operation: sum, product, min, max, avg, join
    --sep: string = ", "             # Separator (join only)
]: list -> any {
    match $op {
        "sum"     => { $in | math sum }
        "product" => { $in | math product }
        "min"     => { $in | math min }
        "max"     => { $in | math max }
        "avg"     => { $in | math avg }
        "join"    => { $in | str join $sep }
        _ => { error make {msg: $"Unknown reduce op: ($op). Valid: sum, product, min, max, avg, join"} }
    }
}
