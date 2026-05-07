# Return unique values from a list (deduplicate)
@category transform
export def "prim-uniq" []: list -> list {
    $in | uniq
}
