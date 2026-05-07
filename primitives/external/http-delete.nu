# HTTP DELETE request
@category external
export def "prim-http-delete" [
    --url: string = ""               # URL to DELETE
]: any -> any {
    http delete $url
}
