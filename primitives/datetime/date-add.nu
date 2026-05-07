# Add a duration to a datetime. amount examples: 1day, 2hr, 30min, -7day
@category datetime
export def "prim-date-add" [
    --amount: string = "1day"        # Duration string: 1day, 2hr, 30min, -7day, etc.
]: any -> datetime {
    let dt = if ($in | describe) == 'string' {
        $in | into datetime
    } else {
        $in
    }
    $dt + ($amount | into duration)
}
