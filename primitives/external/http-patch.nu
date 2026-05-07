# HTTP PATCH request — pipe body in, get response back
@category external
export def "prim-http-patch" [
    --url: string = ""               # URL to PATCH
    --content-type: string = "application/json"  # Content-Type header
    --timeout_ms: string = ""        # Max execution time in ms (handled by executor)
    --retries: string = ""           # Retry attempts on transient errors (handled by executor)
]: any -> any {
    $in | to json | http patch $url --content-type $content_type
}
