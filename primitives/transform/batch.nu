# Split a list into chunks of --size elements. Returns a list of lists.
@category transform
export def "prim-batch" [
    --size: string = "10"            # Number of elements per chunk
]: list -> list {
    $in | chunks ($size | into int)
}
