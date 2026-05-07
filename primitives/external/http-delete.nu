# HTTP DELETE request
@category external
export def "prim-http-delete" [
    --url: string = ""               # URL to DELETE
    --timeout_ms: string = ""        # Max execution time in ms (handled by executor)
    --retries: string = ""           # Retry attempts on transient errors (handled by executor)
]: any -> any {
    http delete $url
}
