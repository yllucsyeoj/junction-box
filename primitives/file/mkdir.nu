# Create a directory (and parents) at the given path
@category file
export def "prim-mkdir" [
    --path: string = ""              # Directory path to create
]: nothing -> nothing {
    mkdir $path
}
