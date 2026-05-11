# Query a Supabase table via the Supabase REST API. Returns a table of rows from the specified table with optional filtering, sorting, and column selection. Requires SUPABASE_KEY and SUPABASE_PROJECT env vars.
@category database
export def "prim-supabase-query" [
    --table: string = ""         # [wirable][required] Table name to query
    --select: string = "*"       # Columns to select (comma-separated)
    --filter: string = ""        # [wirable] Filter expression (e.g. "status=eq.active" or "name=ilike.%john%")
    --order: string = ""         # Order clause (e.g. "created_at.desc" or "name.asc")
    --limit: string = "50"       # Max rows (1–1000)
    --offset: string = "0"       # Row offset for pagination
]: nothing -> table {
    let tbl = if ($table | str starts-with '"') { try { $table | from json } catch { $table } } else { $table }
    if ($tbl | is-empty) { error make {msg: "provide --table to query Supabase"} }

    let key = $env.SUPABASE_KEY?
    let project = $env.SUPABASE_PROJECT?
    if (($key | default "") | is-empty) { error make {msg: "set SUPABASE_KEY environment variable"} }
    if (($project | default "") | is-empty) { error make {msg: "set SUPABASE_PROJECT environment variable"} }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 1000] | math min)
    let off = ($offset | into int | math abs)

    let headers = {
        User-Agent: "junction-box/1.0"
        apikey: $key
        Authorization: $"Bearer ($key)"
    }

    let params = {select: $select}
    let params = if ($filter | is-empty) { $params } else {
        let parts = ($filter | split row "=")
        let col = ($parts | first)
        let val = ($parts | skip 1 | str join "=")
        $params | insert $col $val
    }
    let params = if ($order | is-empty) { $params } else { $params | insert order $order }

    let url = ({
        scheme: "https",
        host: $"($project).supabase.co",
        path: $"/rest/v1/($tbl)",
        params: ($params | merge {limit: ($clamped | into string), offset: ($off | into string)})
    } | url join)

    try { http get -H $headers $url } catch { |e| error make {msg: $"Supabase query failed: ($e.msg)"} }
}

# Insert a record or table of records into a Supabase table. Input is a record or table — gets posted as JSON to the table endpoint. Requires SUPABASE_KEY and SUPABASE_PROJECT env vars. Returns the inserted row(s).
@category database
export def "prim-supabase-insert" [
    --table: string = ""    # [wirable][required] Table name to insert into
]: any -> any {
    let tbl = if ($table | str starts-with '"') { try { $table | from json } catch { $table } } else { $table }
    if ($tbl | is-empty) { error make {msg: "provide --table to insert into"} }

    let key = $env.SUPABASE_KEY?
    let project = $env.SUPABASE_PROJECT?
    if (($key | default "") | is-empty) { error make {msg: "set SUPABASE_KEY environment variable"} }
    if (($project | default "") | is-empty) { error make {msg: "set SUPABASE_PROJECT environment variable"} }

    let url = ({
        scheme: "https",
        host: $"($project).supabase.co",
        path: $"/rest/v1/($tbl)"
    } | url join)

    let headers = {
        User-Agent: "junction-box/1.0"
        apikey: $key
        Authorization: $"Bearer ($key)"
        Prefer: "return=representation"
    }

    let input = $in
    let body = if ($input | describe) =~ "table" or ($input | describe) =~ "list" {
        $input | to json
    } else {
        [$input] | to json
    }

    try { $body | http post -H $headers --content-type application/json $url } catch { |e| error make {msg: $"Supabase insert failed: ($e.msg)"} }
}