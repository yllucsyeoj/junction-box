# HTTP HEAD request — returns headers only
@category external
export def "prim-http-head" [
    --url: string = ""               # URL to HEAD
]: any -> record {
    http head $url
}
