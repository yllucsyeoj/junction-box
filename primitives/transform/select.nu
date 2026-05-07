# Keep only the named columns from a table (comma- or space-separated, e.g. "name,email,phone")
@category transform
export def "prim-select" [
    --columns: string = ""       # Comma- or space-separated column names (e.g. "name,age,email")
]: table -> table {
    select ...($columns | split row --regex '[,\s]+' | where {|c| $c != ""})
}
