# Move a column to a new position in a table. Use --before to insert before another column.
@category transform
export def "prim-move" [
    --column: string = ""             # Column to move
    --before: string = ""             # Insert before this column (empty = move to end)
]: table -> table {
    let input = $in
    let cols = ($input | columns)
    let col_idx = ($cols | enumerate | where $in.item == $column | get 0.index | into int)
    if ($col_idx | is-empty) {
        error make {msg: $"Column not found: ($column)"}
    } else {
        let other_cols = ($cols | where {|c| $c != $column})
        let new_order = if ($before | is-empty) {
            $other_cols | append $column
        } else {
            let before_idx = ($other_cols | enumerate | where $in.item == $before | get 0.index | into int)
            if ($before_idx | is-empty) {
                error make {msg: $"Column not found: ($before)"}
            } else {
                mut result = []
                for i in 0..<($other_cols | length) {
                    if $i == $before_idx {
                        $result = ($result | append $column)
                    }
                    $result = ($result | append ($other_cols | get $i))
                }
                $result
            }
        }
        $input | select ...$new_order
    }
}
