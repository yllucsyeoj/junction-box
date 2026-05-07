# Apply a math operation (+, -, *, /) to a number. Wire a number to --operand for multi-input.
@category compute
export def "prim-math" [
    --op: string = "+"           # [options:+,-,*,/] Operation: +, -, *, /
    --operand: string = "0"      # [wirable] The second operand (as string, parsed to float)
]: number -> number {
    let x = $in
    let operands = if (($operand | from json | describe) | str starts-with 'list') {
        ($operand | from json | each {|v| $v | into float })
    } else {
        [($operand | into float)]
    }
    $operands | reduce --fold $x {|n, acc|
        match $op {
            "+" => { $acc + $n }
            "-" => { $acc - $n }
            "*" => { $acc * $n }
            "/" => { $acc / $n }
            _ => { error make {msg: $"Unknown math op: ($op). Valid: +, -, *, /"} }
        }
    }
}
