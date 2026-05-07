# Add or replace a column with a NUON constant value
@category transform
export def "prim-map" [
    --column: string = ""        # Column name to add or update
    --value: string = "null"     # [format:nuon] NUON literal for the new value
]: table -> table {
    upsert $column {|_| (try { $value | from nuon } catch { $value })}
}
