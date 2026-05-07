# Iterate over a list with an accumulator. In --expr: $in.elem is the current item, $in.acc is the running accumulator (seeded by --init). Returns the final accumulator.
@category logic
export def "prim-for" [
    --over: string = "[]"            # List to iterate over (as NUON)
    --init: string = "[]"           # Initial accumulator value
    --expr: string = "$in"          # Nu expression — $in is {elem, acc}, should return value to append
]: any -> any {
    let items = ($over | from nuon)
    mut acc = ($init | from nuon)
    for item in $items {
        let input = {elem: $item, acc: $acc}
        let result = (nu -c $"(($input | to nuon)) | do { ($expr) } | to nuon" | from nuon)
        $acc = ($acc | append $result)
    }
    $acc
}
