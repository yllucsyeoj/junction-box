# Compute hash of a string: md5, sha256
@category compute
export def "prim-hash" [
    --algo: string = "sha256"        # [options:md5,sha256] Hash algorithm: md5, sha256
]: string -> string {
    match $algo {
        "md5" => { $in | hash md5 }
        "sha256" => { $in | hash sha256 }
        _ => { error make {msg: $"Unknown hash algo: ($algo). Valid: md5, sha256"} }
    }
}
