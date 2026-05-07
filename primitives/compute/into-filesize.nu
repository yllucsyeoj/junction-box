# Convert a string like 5MB into a filesize value
@category compute
export def "prim-into-filesize" []: string -> filesize {
    $in | into filesize
}
