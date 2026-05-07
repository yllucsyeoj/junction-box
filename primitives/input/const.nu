# Provide a fixed NUON constant value (e.g. 42, "hello", [1 2 3])
@category input
export def "prim-const" [
    --value: string = "null"     # [format:nuon] Value to emit: NUON expression or plain string
]: nothing -> any {
    try { $value | from nuon } catch { $value }
}
