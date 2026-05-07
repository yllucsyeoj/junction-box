# Convert datetime to a different timezone
@category datetime
export def "prim-to-timezone" [
    --zone: string = "UTC"          # Target timezone (e.g. America/New_York, Europe/London)
]: datetime -> datetime {
    $in | date to-timezone $zone
}
