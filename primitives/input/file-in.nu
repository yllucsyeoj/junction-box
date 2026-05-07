# Read a file — auto-detects CSV/JSON/NUON, else returns raw string
@category input
export def "prim-file-in" [
    --path: string = ""          # File path to read
]: nothing -> any {
    open $path
}
