# Find files matching a glob pattern (e.g. **/*.json)
@category file
export def "prim-glob" [
    --pattern: string = ""          # Glob pattern (e.g. **/*.json, *.txt)
]: nothing -> list {
    glob $pattern
}
