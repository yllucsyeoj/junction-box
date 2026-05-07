# Merge a NUON record into the input record — overlapping keys overwritten. Wire a record to --with for multi-input.
@category transform
export def "prim-merge" [
    --with: string = "{}"            # [wirable][format:nuon] NUON record to merge in (overlapping keys overwritten)
]: record -> record {
    let overlay = if (($with | from json | describe) | str starts-with 'list') {
        ($with | from json | each {|v| $v | from nuon} | reduce {|item, acc| $acc | merge $item })
    } else {
        ($with | from nuon)
    }
    $in | merge $overlay
}
