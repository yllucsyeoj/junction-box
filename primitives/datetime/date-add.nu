# Add a duration to a datetime. amount examples: 1day, 2hr, 30min, -7day
@category datetime
export def "prim-date-add" [
    --amount: string = "1day"        # Duration string: 1day, 2hr, 30min, -7day, etc.
]: datetime -> datetime {
    $in + ($amount | into duration)
}
