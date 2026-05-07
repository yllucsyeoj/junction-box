# Cast a value to a target type: int, float, string, bool
@category compute
export def "prim-type-cast" [
    --target: string = "string"  # [options:int,float,string,bool] Target type: int, float, string, bool
]: any -> any {
    let v = $in
    match $target {
        "int" => { $v | into int }
        "float" => { $v | into float }
        "string" => { $v | into string }
        "bool" => { $v | into bool }
        _ => { error make {msg: $"Unknown type: ($target). Valid: int, float, string, bool"} }
    }
}
