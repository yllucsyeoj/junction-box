# Apply a math operation (+, -, *, /) to a number. Wire a number to --operand for multi-input.
@category compute
export def "prim-math" [
    --op: string = "+"           # [options:+,-,*,/] Operation: +, -, *, /
    --operand: any = "0"         # [wirable] The second operand (number or string, parsed to float)
]: number -> number {
    let x = $in
    let operand_val = if ($operand | describe) == 'string' {
        $operand | from json
    } else {
        $operand
    }
    let operands = if (($operand_val | describe) | str starts-with 'list') {
        ($operand_val | each {|v| $v | into float })
    } else {
        [($operand_val | into float)]
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
