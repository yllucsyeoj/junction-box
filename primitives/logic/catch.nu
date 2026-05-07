# Catch errors and handle them with a handler expression.
@category logic
export def "prim-catch" [
    --handler: string = "{}"          # Handler expression that receives the error as $in
    --expr: string = "$in"           # Nu expression that may fail
]: any -> any {
    let upstream_error = (try { $env.GONUDE_UPSTREAM_ERROR } catch { null })
    if $upstream_error != null {
        let err_obj = ($upstream_error | from json)
        nu -c $"(( $err_obj | to nuon )) | do { ( $handler ) } | to nuon" | from nuon
    } else {
        try {
            nu -c $"(( $in | to nuon )) | do { ( $expr ) } | to nuon" | from nuon
        } catch {|err|
            nu -c $"(( $err | to nuon )) | do { ( $handler ) } | to nuon" | from nuon
        }
    }
}
