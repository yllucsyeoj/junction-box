# Zip two parallel lists into a table of records. Wire second list to --right port. --key_a / --key_b name the fields.
@category transform
export def "prim-zip" [
    --right: string = "[]"           # [wirable][format:nuon] Right list as NUON (wire an edge to this port)
    --key_a: string = "left"         # Field name for left-side values
    --key_b: string = "right"        # Field name for right-side values
]: list -> table {
    let r = ($right | from nuon)
    $in | zip $r | each {|pair|
        {($key_a): ($pair | get 0), ($key_b): ($pair | get 1)}
    }
}
