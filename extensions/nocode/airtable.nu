# Query an Airtable base/table via the Airtable REST API. Returns a table of records with fields flattened into columns. Requires AIRTABLE_API_KEY env var.
@category nocode
export def "prim-airtable-query" [
    --base: string = ""          # [wirable][required] Airtable Base ID (starts with "app")
    --table: string = ""         # [wirable][required] Table name (URL-encoded if contains spaces)
    --fields: string = ""        # Comma-separated field names to include (empty = all)
    --limit: string = "100"      # Max records (1–100)
    --offset: string = ""        # [wirable] Offset string for pagination (from previous response)
    --view: string = ""          # View name to filter/sort by
]: nothing -> table {
    let b = if ($base | str starts-with '"') { try { $base | from json } catch { $base } } else { $base }
    let t = if ($table | str starts-with '"') { try { $table | from json } catch { $table } } else { $table }
    if (($b | default "") | is-empty) { error make {msg: "provide --base (Airtable Base ID)"} }
    if (($t | default "") | is-empty) { error make {msg: "provide --table to query"} }

    let api_key = $env.AIRTABLE_API_KEY?
    if (($api_key | default "") | is-empty) { error make {msg: "set AIRTABLE_API_KEY environment variable"} }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 100] | math min)

    let params = {maxRecords: ($clamped | into string)}
    let params = if ($fields | is-empty) { $params } else { $params | insert "fields[]" $fields }
    let params = if ($view | is-empty) { $params } else { $params | insert view $view }
    let params = if ($offset | is-empty) { $params } else {
        let o = if ($offset | str starts-with '"') { try { $offset | from json } catch { $offset } } else { $offset }
        $params | insert offset $o
    }

    let url = ({
        scheme: "https",
        host: "api.airtable.com",
        path: $"/v0/($b)/($t)",
        params: $params
    } | url join)

    let headers = {
        User-Agent: "junction-box/1.0"
        Authorization: $"Bearer ($api_key)"
    }

    let resp = (try { http get -H $headers $url } catch { |e| error make {msg: $"Airtable query failed: ($e.msg)"} })

    let records = ($resp.records? | default [])
    if ($records | is-empty) { return [] }

    $records | each {|rec|
        let fields = ($rec.fields? | default {})
        let base_rec = {
            id:       ($rec.id? | default "")
            createdTime: ($rec.createdTime? | default "")
        }
        $fields | columns | reduce --fold $base_rec {|col, acc|
            $acc | insert $col ($fields | get $col)
        }
    }
}