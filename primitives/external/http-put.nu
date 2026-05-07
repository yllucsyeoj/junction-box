# HTTP PUT — replace a resource. --url and --headers are wirable. Use headers for Authorization: {"Authorization": "Bearer sk-..."}.
@category external
export def "prim-http-put" [
    --url: string = ""               # [wirable][required] URL to PUT to
    --headers: string = "{}"         # [wirable] Headers as JSON object (e.g. {"Authorization": "Bearer sk-..."})
    --content-type: string = "application/json"  # Content-Type header
    --timeout_ms: string = ""        # Max execution time in ms (handled by executor)
    --retries: string = ""           # Retry attempts on transient errors (handled by executor)
]: any -> any {
    let url_val = if ($url | str starts-with '"') { try { $url | from json } catch { $url } } else { $url }
    let h = try { $headers | from json } catch { try { $headers | from nuon } catch { {} } }
    let body_json = ($in | to json)
    if ($h | is-empty) {
        $body_json | http put --content-type $content_type $url_val
    } else {
        $body_json | http put --content-type $content_type --headers $h $url_val
    }
}
