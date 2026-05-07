# Template string interpolation — input must be a record; use {field} placeholders in --template
@category compute
export def "prim-str-interp" [
    --template: string = ""          # Template with {field} placeholders e.g. "Hello {name}!"
]: record -> string {
    let rec = $in
    mut result = $template
    for key in ($rec | columns) {
        let placeholder = ("{" + $key + "}")
        let val = $"($rec | get $key)"
        $result = ($result | str replace --all $placeholder $val)
    }
    $result
}
