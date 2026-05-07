# Display the value (writes to stderr) and pass it through — safe to use mid-pipeline.
@category output
export def "prim-display" []: any -> any {
    print --stderr ($in | table)
    $in
}
