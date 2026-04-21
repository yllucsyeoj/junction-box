export def "prim-display" []: any -> any {
    print --stderr ($in | table)
