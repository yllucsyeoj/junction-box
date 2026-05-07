# Parse a string as JSON, NUON, CSV, TOML, or YAML into a value
@category compute
export def "prim-from-string" [
    --format: string = "json"      # [options:json,nuon,csv,toml,yaml] Input format: json, nuon, csv, toml, yaml
]: string -> any {
    match $format {
        "csv" => { $in | from csv }
        "nuon" => { $in | from nuon }
        "toml" => { $in | from toml }
        "yaml" => { $in | from yaml }
        _ => { $in | from json }
    }
}
