# Join path components into a full path
@category file
export def "prim-path-join" [
    --parts: string = ""            # Comma- or space-separated path components to join
]: string -> string {
    let base = $in
    let components = ($parts | split row --regex '[,\s]+' | where {|c| $c != ""})
    $base | path join ...$components
}
