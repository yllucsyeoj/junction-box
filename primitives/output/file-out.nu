# Write the value to a file. format: json, csv, text, or nuon
@category output
export def "prim-file-out" [
    --path: string = ""          # File path to write to
    --format: string = "json"    # [options:json,csv,text,nuon] Output format: json, csv, text, nuon
]: any -> record {
    match $format {
        "json" => { $in | to json | save --force $path }
        "csv" => { $in | to csv | save --force $path }
        "text" => { $in | into string | save --force $path }
        _ => { $in | to nuon | save --force $path }
    }
    {saved: $path, format: $format}
}
