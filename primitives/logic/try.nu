# Try an expression, return fallback NUON on error.
@category logic
export def "prim-try" [
    --fallback: string = "null"        # NUON value to return on error
    --expr: string = "$in"           # Nu expression to try
]: any -> any {
    try {
        nu -c $"(($in | to nuon)) | do { ($expr) } | to nuon" | from nuon
    } catch {
        $fallback | from nuon
    }
}
