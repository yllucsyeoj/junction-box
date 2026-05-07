# Serialize a table to a CSV string
@category output
export def "prim-to-csv"  []: table -> string { $in | to csv }
