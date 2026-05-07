# List directory contents as a table (name, type, size, modified)
@category file
export def "prim-ls" [
    --path: string = "."             # Directory path to list
]: nothing -> table {
    ls $path
}
