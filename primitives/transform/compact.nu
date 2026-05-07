# Remove null values from a list or table
@category transform
export def "prim-compact" []: any -> any {
    $in | compact
}
