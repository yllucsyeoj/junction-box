# Parse a string into a datetime value — optionally provide a --fmt strftime pattern
@category datetime
export def "prim-into-datetime" [
    --fmt: string = ""               # Optional strftime format hint
]: string -> datetime {
    if ($fmt | is-empty) {
        $in | into datetime
    } else {
        $in | into datetime --format $fmt
    }
}
