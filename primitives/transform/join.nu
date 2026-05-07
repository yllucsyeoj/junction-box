# SQL-style join two tables on a shared column. Wire second table to --right port.
@category transform
export def "prim-join" [
    --right: string = "[]"           # [wirable][format:nuon] Right table as NUON (wire edge to this port)
    --on: string = ""                # Column name to join on
    --type: string = "inner"         # [options:inner,left] Join type: inner or left
]: table -> table {
    let input = $in
    let raw_r = if (($right | from json | describe) | str starts-with 'list') {
        ($right | from json | each {|v| $v | from nuon})
    } else {
        ($right | from nuon)
    }
    let right_table = if ($raw_r | describe | str starts-with 'record') { [$raw_r] | table } else { $raw_r }
    if $type == "left" {
        $input | join $right_table $on --left
    } else {
        $input | join $right_table $on
    }
}
