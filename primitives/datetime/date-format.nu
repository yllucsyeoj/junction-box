# Format a datetime as a string using a strftime pattern (default: %Y-%m-%d %H:%M:%S)
@category datetime
export def "prim-date-format" [
    --fmt: string = "%Y-%m-%d %H:%M:%S"  # strftime format string
]: datetime -> string {
    $in | format date $fmt
}
