# Multi-way conditional: match a value against patterns. Patterns separated by spaces, each pattern:result pair colon-delimited.
@category logic
export def "prim-match" [
    --value: string = ""              # Value to match against (empty = match $in)
    --pattern: string = ""            # Space-separated pattern:result pairs (e.g. "foo:FOO bar:BAR default:DEFAULT")
    --default: string = "null"        # Default result when no pattern matches
]: any -> any {
    let v = if ($value | is-empty) { $in } else { $value }
    let pairs = ($pattern | split row " " | each {|p|
        let parts = ($p | split row ":" | first 2)
        {pattern: ($parts | get 0), result: ($parts | get 1)}
    })
    mut result = null
    mut found = false
    for pair in $pairs {
        if $v == $pair.pattern and not $found {
            $result = (try { $pair.result | from nuon } catch { $pair.result })
            $found = true
        }
    }
    if not $found {
        $result = (try { $default | from nuon } catch { $default })
    }
    $result
}
