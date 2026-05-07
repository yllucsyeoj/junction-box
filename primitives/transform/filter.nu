# Filter table rows: pick column, op (>, <, ==, !=, contains), and value (plain string — no NUON quoting needed). Column must be a top-level name — dotted paths like address.city are not supported.
@category transform
export def "prim-filter" [
    --column: string = ""        # Column name to filter on
    --op: string = "=="          # [options:==,!=,>,<,contains] Operator: >, <, ==, !=, contains
    --value: string = ""         # [format:plain] Comparison value
]: table -> table {
    let desc = (try { $in | get 0 | get $column | describe } catch { "" })
    let is_datetime_col = ($desc | str contains 'datetime')
    let input = $in
    match $op {
        ">" => {
            if $is_datetime_col {
                $input | where {|r| ($r | get $column) > ($value | into datetime)}
            } else {
                $input | where {|r| ($r | get $column) > ($value | into float)}
            }
        }
        "<" => {
            if $is_datetime_col {
                $input | where {|r| ($r | get $column) < ($value | into datetime)}
            } else {
                $input | where {|r| ($r | get $column) < ($value | into float)}
            }
        }
        "==" => { $input | where {|r| ($r | get $column | into string) == $value} }
        "!=" => { $input | where {|r| ($r | get $column | into string) != $value} }
        "contains" => { $input | where {|r| ($r | get $column | into string) | str contains $value} }
        _ => { error make {msg: $"Unknown filter op: ($op). Valid: >, <, ==, !=, contains"} }
    }
}
