# Fetch JSON/table data from a URL via HTTP GET. --url is wirable — wire a string output to set it dynamically.
@category input
export def "prim-fetch" [
    --url: string                # [wirable][required] URL to fetch (wirable — wire a string output to set dynamically)
    --headers: string = "{}"     # Headers as NUON record string
    --timeout_ms: string = ""    # Max execution time in ms (handled by executor)
    --retries: string = ""       # Retry attempts on transient errors (handled by executor)
]: nothing -> any {
    # Wired params arrive as JSON-encoded strings; static params arrive as plain strings.
    let url_val = if ($url | str starts-with '"') { try { $url | from json } catch { $url } } else { $url }
    let h = ($headers | from nuon)
    if ($h | is-empty) {
        http get $url_val
    } else {
        http get $url_val --headers $h
    }
}
