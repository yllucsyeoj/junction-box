# Query historical pipeline runs with their results. Returns {run_id, patch_alias, status, run_at, result} per run. Filter by alias, status, limit, or date range.
@category db
export def "prim-db-query" [
    --alias: string = ""     # [wirable] Filter by patch alias (exact match, e.g. "my-patch")
    --status: string = ""    # Filter by run status: complete, error, scheduled, pending — empty returns all
    --limit: string = "20"   # Max rows to return (default 20, max 500)
    --since: string = ""     # [wirable] Only runs on or after this date (ISO format: "2026-05-01" or "2026-05-01T00:00:00")
]: nothing -> table {
    let db_path = ($env.GONUDE_DATA_DIR? | default "./data") | path join "junction-box.db"

    # Decode wired params — wired string values arrive JSON-encoded (e.g. "\"my-alias\"")
    let alias_val = if ($alias | str starts-with '"') { try { $alias | from json } catch { $alias } } else { $alias }
    let since_val = if ($since | str starts-with '"') { try { $since | from json } catch { $since } } else { $since }

    # Validate status
    let valid_statuses = ["complete", "error", "scheduled", "pending"]
    if ($status != "" and not ($status in $valid_statuses)) {
        error make { msg: $"status must be one of: ($valid_statuses | str join ', ') — or empty for all" }
    }

    # Clamp limit
    let row_limit = [($limit | into int | math abs), 500] | math min

    # Build WHERE conditions
    let conditions = []
    let conditions = if ($alias_val != "") { $conditions | append $"patch_alias = '($alias_val)'" } else { $conditions }
    let conditions = if ($status != "") { $conditions | append $"status = '($status)'" } else { $conditions }
    let conditions = if ($since_val != "") { $conditions | append $"run_at >= '($since_val)'" } else { $conditions }

    let where_clause = if ($conditions | is-empty) { "" } else { $"WHERE ($conditions | str join ' AND ')" }
    let sql = $"SELECT run_id, patch_alias, status, run_at, result FROM runs_v ($where_clause) LIMIT ($row_limit)"

    let rows = (try { open $db_path | query db $sql } catch { |e| error make { msg: $"Run query failed: ($e.msg)" } })

    if ($rows | is-empty) { return [] }

    # Parse the result column from JSON string to native value
    $rows | update result { |row|
        if ($row.result != null) {
            try { $row.result | from json } catch { $row.result }
        } else { null }
    }
}
