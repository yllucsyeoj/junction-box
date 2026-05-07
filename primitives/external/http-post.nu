# HTTP POST request — pipe body in, get response back
@category external
export def "prim-http-post" [
    --url: string = ""             # URL to POST to
    --content-type: string = "application/json"  # Content-Type header
]: any -> any {
    $in | to json | http post $url --content-type $content_type
}
