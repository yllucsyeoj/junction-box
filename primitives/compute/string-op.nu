# Apply a string operation: upcase, downcase, trim, length, split, replace, starts-with, ends-with, contains, substring (arg: old:new)
@category compute
export def "prim-string-op" [
    --op: string = "upcase"      # [options:upcase,downcase,trim,length,split,replace,starts-with,ends-with,contains,substring] Operation: upcase, downcase, trim, length, split, replace, starts-with, ends-with, contains, substring
    --arg: string = ""           # Arg for split (delimiter), replace (old:new), starts-with/ends-with/contains (needle), substring (start:end)
]: string -> any {
    let s = $in
    match $op {
        "upcase" => { $s | str upcase }
        "downcase" => { $s | str downcase }
        "trim" => { $s | str trim }
        "length" => { $s | str length }
        "split" => { $s | split row $arg }
        "replace" => {
            let parts = ($arg | split row ":" | first 2)
            $s | str replace ($parts | get 0) ($parts | get 1)
        }
        "starts-with" => { $s | str starts-with $arg }
        "ends-with" => { $s | str ends-with $arg }
        "contains" => { $s | str contains $arg }
        "substring" => {
            let parts = ($arg | split row ":" | each {|x| $x | into int })
            $s | str substring ($parts | get 0)..<($parts | get 1)
        }
        _ => { error make {msg: $"Unknown string op: ($op). Valid: upcase, downcase, trim, length, split, replace, starts-with, ends-with, contains, substring"} }
    }
}
