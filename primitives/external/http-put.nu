# HTTP PUT request — pipe body in, get response back
@category external
export def "prim-http-put" [
    --url: string = ""               # URL to PUT to
    --content-type: string = "application/json"  # Content-Type header
    --timeout_ms: string = ""        # Max execution time in ms (handled by executor)
    --retries: string = ""           # Retry attempts on transient errors (handled by executor)
]: any -> any {
    $in | to json | http put $url --content-type $content_type
}
