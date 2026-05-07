# HTTP POST request — pipe body in, get response back
@category external
export def "prim-http-post" [
    --url: string = ""             # URL to POST to
    --content-type: string = "application/json"  # Content-Type header
    --timeout_ms: string = ""      # Max execution time in ms (handled by executor)
    --retries: string = ""         # Retry attempts on transient errors (handled by executor)
]: any -> any {
    $in | to json | http post $url --content-type $content_type
}
