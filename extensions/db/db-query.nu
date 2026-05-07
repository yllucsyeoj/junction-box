# Query the junction-box SQLite database for historical runs. Supply a SELECT query — results returned as a table.
@category db
export def "prim-db-query" [
    --query: string                # [wirable][required] SQL SELECT against junction-box SQLite
    --timeout_ms: string = ""       # Max execution time (handled by executor)
    --retries: string = ""         # Retry attempts (handled by executor)
]: nothing -> table {
    # Whitelist validation — block dangerous keywords
    let upper = $query | str upcase | str trim
    let blocked = [
        "INSERT", "UPDATE", "DELETE", "REPLACE", "DROP", "ALTER", "CREATE",
        "TRUNCATE", "PRAGMA", "ATTACH", "DETACH", "BEGIN",
        "COMMIT", "ROLLBACK", "--", "/*", "UNION"
    ]
    for kw in $blocked {
        if ($upper | str contains $kw) {
            error make { msg: $"Query contains forbidden keyword '($kw)' — only SELECT allowed" }
        }
    }

    let db_path = ($env.GONUDE_DATA_DIR? | default "./data") | path join "junction-box.db"

    # Open and query using Nu's native SQLite support
    let result = (open $db_path | query db $query)

    if ($result | is-empty) { [] } else { $result }
}
