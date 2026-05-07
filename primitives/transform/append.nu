# Append to a list. Wire a second list/value to --items for multi-input.
@category transform
export def "prim-append" [
    --items: string = "[]"           # [wirable][format:nuon] NUON list or value to append
]: any -> list {
    let input = $in
    let parsed = ($items | from nuon)
    let desc = ($parsed | describe)
    if ($desc | str starts-with 'list') or ($desc | str starts-with 'table') {
        $input | append $parsed
    } else {
        $input | append [$parsed]
    }
}
