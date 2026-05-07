# Provide a fixed constant value. Accepts JSON (preferred) or NUON. Unresolved __param__: placeholders return null.
@category input
export def "prim-const" [
    --value: string = "null"     # Value to emit: JSON value, NUON expression, or plain string
]: nothing -> any {
    if ($value | str starts-with "__param__:") { return null }
    try { $value | from json } catch { try { $value | from nuon } catch { $value } }
}
