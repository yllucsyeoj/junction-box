# Update a field in a record/table with a NUON value
@category transform
export def "prim-update" [
    --field: string = ""             # Field name to update
    --value: string = "null"         # [format:nuon] NUON replacement value
]: any -> any {
    update $field (try { $value | from nuon } catch { $value })
}
