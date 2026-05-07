# Remove a file at the given path
@category file
export def "prim-rm" [
    --path: string = ""              # File path to remove
]: nothing -> nothing {
    rm $path
}
