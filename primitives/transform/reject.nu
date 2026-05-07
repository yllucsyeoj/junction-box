# Remove named columns from a table or record (comma- or space-separated)
@category transform
export def "prim-reject" [
    --columns: string = ""           # Comma- or space-separated column names to remove
]: any -> any {
    reject ...($columns | split row --regex '[,\s]+' | where {|c| $c != ""})
}
