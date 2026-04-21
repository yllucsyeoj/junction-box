export def "prim-into-filesize" []: string -> filesize {
    $in | into filesize
