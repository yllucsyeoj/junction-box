# Parse a file path into its components (dir, stem, extension)
@category file
export def "prim-path-parse" [
]: string -> record {
    let p = $in
    let abs = ($p | path expand)
    let parsed = ($abs | path parse)
    {
        full: $abs
        dir: ($parsed | get parent)
        stem: ($parsed | get stem)
        extension: ($parsed | get extension)
    }
}
