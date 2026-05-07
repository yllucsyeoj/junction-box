# Convert a string like 1hr 30min into a duration value
@category compute
export def "prim-into-duration" []: string -> duration {
    $in | into duration
}
