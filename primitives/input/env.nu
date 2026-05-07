# Read an environment variable by name, returns its string value
@category input
export def "prim-env" [
    --key: string = ""           # Environment variable name
]: nothing -> string {
    $env | get $key
}
