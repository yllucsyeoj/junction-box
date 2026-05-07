# While loop with condition and body expressions. --max-iter prevents infinite loops.
@category logic
export def "prim-while" [
    --init: string = "{}"            # Initial state value
    --cond: string = "$in"          # Condition expression — should return bool
    --body: string = "$in"          # Body expression — runs each iteration, $in is state
    --max-iter: string = "1000"      # Maximum iterations to prevent infinite loops
]: any -> any {
    mut state = ($init | from nuon)
    let max = ($max_iter | into int)
    mut iter = 0
    while $iter < $max {
        let cond_result = (nu -c $"(($state | to nuon)) | do { ($cond) } | to nuon" | from nuon | into bool)
        if not $cond_result {
            break
        }
        $state = (nu -c $"(($state | to nuon)) | do { ($body) } | to nuon" | from nuon)
        $iter = $iter + 1
    }
    $state
}
