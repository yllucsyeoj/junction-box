# HTTP DELETE — remove a resource. --url and --headers are wirable. Use headers for Authorization: {"Authorization": "Bearer sk-..."}.
@category external
export def "prim-http-delete" [
    --url: string = ""               # [wirable][required] URL to DELETE
    --headers: string = "{}"         # [wirable] Headers as JSON object (e.g. {"Authorization": "Bearer sk-..."})
    --timeout_ms: string = ""        # Max execution time in ms (handled by executor)
    --retries: string = ""           # Retry attempts on transient errors (handled by executor)
]: any -> any {
    let url_val = if ($url | str starts-with '"') { try { $url | from json } catch { $url } } else { $url }
    let h = try { $headers | from json } catch { try { $headers | from nuon } catch { {} } }
    if ($h | is-empty) {
        http delete $url_val
    } else {
        http delete --headers $h $url_val
    }
}
