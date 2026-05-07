# Skip the first N rows/elements from a list or table
@category transform
export def "prim-drop" [
    --n: string = "1"                # Number of rows/elements to skip
]: any -> any {
    $in | skip ($n | into int)
}
