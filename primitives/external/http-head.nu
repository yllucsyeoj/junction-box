# HTTP HEAD request — returns headers only
@category external
export def "prim-http-head" [
    --url: string = ""               # URL to HEAD
    --timeout_ms: string = ""        # Max execution time in ms (handled by executor)
    --retries: string = ""           # Retry attempts on transient errors (handled by executor)
]: any -> record {
    http head $url
}
