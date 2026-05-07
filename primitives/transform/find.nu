# Find the index of the first list element matching a condition ($in = element).
@category transform
export def "prim-find" [
    --expr: string = "$in"            # Nu expression — $in is current element, should return bool
]: list -> int {
    let list = $in
    let len = ($list | length)
    mut index = -1
    for i in 0..<$len {
        let elem = ($list | get $i)
        let matches = (nu -c $"(($elem | to nuon)) | do { ($expr) } | to nuon" | from nuon)
        if $matches {
            $index = $i
            break
        }
    }
    $index
}
