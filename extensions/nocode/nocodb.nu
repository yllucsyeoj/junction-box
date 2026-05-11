# Query a NocoDB table via the NocoDB REST API. Returns a table of records from the specified table. Requires NOCODB_API_KEY and NOCODB_HOST env vars.
@category nocode
export def "prim-nocodb-query" [
    --table: string = ""         # [wirable][required] Table ID or name
    --limit: string = "25"       # Max records (1–500)
    --offset: string = "0"       # Record offset for pagination
    --fields: string = ""        # Comma-separated field names to include (empty = all)
    --sort: string = ""          # Sort field (prefix with "-" for descending, e.g. "-created_at")
    --where: string = ""         # [wirable] Where clause for filtering (e.g. "(title,eq,hello)")
]: nothing -> table {
    let tbl = if ($table | str starts-with '"') { try { $table | from json } catch { $table } } else { $table }
    if (($tbl | default "") | is-empty) { error make {msg: "provide --table to query NocoDB"} }

    let api_key = $env.NOCODB_API_KEY?
    let raw_host = $env.NOCODB_HOST?
    if (($api_key | default "") | is-empty) { error make {msg: "set NOCODB_API_KEY environment variable"} }
    if (($raw_host | default "") | is-empty) { error make {msg: "set NOCODB_HOST environment variable"} }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 500] | math min)
    let off = ($offset | into int | math abs)

    let headers = {
        User-Agent: "junction-box/1.0"
        "xc-token": $api_key
    }

    let params = {limit: ($clamped | into string), offset: ($off | into string)}
    let params = if ($fields | is-empty) { $params } else { $params | insert fields $fields }
    let params = if ($sort | is-empty) { $params } else { $params | insert sort $sort }
    let params = if ($where | is-empty) { $params } else { $params | insert where $where }

    let url = (noco_build_url $tbl $raw_host $params)
    let headers = (noco_headers $api_key)

    let resp = (try { http get -H $headers $url } catch { |e| error make {msg: $"NocoDB query failed: ($e.msg)"} })

    let records = ($resp.list? | default [])
    if ($records | is-empty) { return [] }

    $records | each {|rec|
        $rec | reject --optional noco_id noco_created_at noco_updated_at noco_deleted_at
    }
}

def noco_build_url [tbl: string, raw_host: string, params: record]: nothing -> string {
    let h = ($raw_host | str trim --char "/" | str trim)
    if ($h | str starts-with "http://") or ($h | str starts-with "https://") {
        let parts = ($h | split row "://")
        let scheme = ($parts | get 0)
        let rest = ($parts | get 1)
        let slash_idx = ($rest | str index-of "/")
        let host_part = if $slash_idx == -1 { $rest } else { $rest | str substring 0..($slash_idx - 1) }
        let base_path = if $slash_idx == -1 { "" } else { $rest | str substring $slash_idx.. }
        let full_path = $"/api/v2/tables/($tbl)/records"
        ({scheme: $scheme, host: $host_part, path: $"($base_path)($full_path)", params: $params} | url join)
    } else {
        ({scheme: "https", host: $h, path: $"/api/v2/tables/($tbl)/records", params: $params} | url join)
    }
}

def noco_headers [api_key: string]: nothing -> record {
    {User-Agent: "junction-box/1.0", "xc-token": $api_key}
}

# Insert a record or table of records into a NocoDB table. Input is a record or table — gets posted as JSON. Requires NOCODB_API_KEY and NOCODB_HOST env vars. Returns the inserted record(s).
@category nocode
export def "prim-nocodb-insert" [
    --table: string = ""    # [wirable][required] Table ID or name
]: any -> any {
    let tbl = if ($table | str starts-with '"') { try { $table | from json } catch { $table } } else { $table }
    if ($tbl | is-empty) { error make {msg: "provide --table to insert into"} }

    let api_key = $env.NOCODB_API_KEY?
    let raw_host = $env.NOCODB_HOST?
    if (($api_key | default "") | is-empty) { error make {msg: "set NOCODB_API_KEY environment variable"} }
    if (($raw_host | default "") | is-empty) { error make {msg: "set NOCODB_HOST environment variable"} }

    let input = $in
    let body = if ($input | describe) =~ "table" or ($input | describe) =~ "list" {
        $input | to json
    } else {
        [$input] | to json
    }

    let url = (noco_build_url $tbl $raw_host {})
    let headers = (noco_headers $api_key)
    try { $body | http post -H $headers --content-type application/json $url } catch { |e| error make {msg: $"NocoDB insert failed: ($e.msg)"} }
}