# Conditional gate: passes input through unchanged when the condition is true; returns --fallback (NUON) when false. Define the condition with --op (==, !=, >, <, is-empty, is-not-empty) and --value (comparison string). Use --column to test a specific field; omit to test the whole input. There is no 'then' expression — add downstream nodes to transform the true-branch value.
@category logic
export def "prim-if" [
    --column: string = ""            # Field to test (empty = test the whole input value)
    --op: string = "=="              # [options:==,!=,>,<,is-empty,is-not-empty] Operator: ==, !=, >, <, is-empty, is-not-empty
    --value: string = ""             # [format:plain] Comparison value (not used for is-empty / is-not-empty)
    --fallback: string = "null"      # [format:nuon] NUON value returned when condition is false
]: any -> any {
    let v = $in
    let subject = if ($column | is-not-empty) { $v | get $column } else { $v }
    let passes = match $op {
        "=="          => { ($subject | into string) == $value }
        "!="          => { ($subject | into string) != $value }
        ">"           => { ($subject | into float) > ($value | into float) }
        "<"           => { ($subject | into float) < ($value | into float) }
        "is-empty"    => { $subject | is-empty }
        "is-not-empty" => { not ($subject | is-empty) }
        _ => { error make {msg: $"Unknown op: ($op). Valid: ==, !=, >, <, is-empty, is-not-empty"} }
    }
    let fallback_val = try { $fallback | from nuon } catch { $fallback }
    if $passes { $v } else { $fallback_val }
}
