# List available timezone names
@category datetime
export def "prim-list-timezone" []: nothing -> list {
    date list-timezone
}
