# Query PostHog insights and events via the PostHog API. Returns a table with query results. Requires POSTHOG_API_KEY and POSTHOG_PROJECT_ID env vars for authentication.
@category analytics
export def "prim-posthog-query" [
    --endpoint: string = "insights" # API endpoint: insights, events, persons, cohorts, dashboards
    --limit: string = "100"        # Max results (1–500)
    --filters: string = "{}"       # [wirable][format:nuon] Additional filters as NUON record (e.g. {events: ["pageview"], date_from: "-7d"})
]: nothing -> table {
    let api_key = $env.POSTHOG_API_KEY?
    let project_id = $env.POSTHOG_PROJECT_ID?
    if (($api_key | default "") | is-empty) { error make {msg: "set POSTHOG_API_KEY environment variable"} }
    if (($project_id | default "") | is-empty) { error make {msg: "set POSTHOG_PROJECT_ID environment variable"} }

    let valid_endpoints = ["insights", "events", "persons", "cohorts", "dashboards"]
    if ($endpoint not-in $valid_endpoints) {
        error make {msg: $"endpoint must be one of: ($valid_endpoints | str join ', ')"}
    }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 500] | math min)

    let f = if ($filters | str starts-with '"') { try { $filters | from json } catch { $filters | from nuon } } else { $filters | from nuon }
    let f = if ($f | describe) =~ "record" { $f } else { {} }

    let url = ({
        scheme: "https",
        host: "app.posthog.com",
        path: $"/api/projects/($project_id)/($endpoint)/",
        params: {limit: ($clamped | into string)}
    } | url join)

    let headers = {
        User-Agent: "junction-box/1.0"
        Authorization: $"Bearer ($api_key)"
    }

    let resp = (try { http get -H $headers $url } catch { |e| error make {msg: $"PostHog API error: ($e.msg)"} })

    let results = ($resp.results? | default ($resp.items? | default []))
    if ($results | is-empty) { return [] }

    if ($results | describe) =~ "list" {
        $results | each {|r|
            if ($r | describe) =~ "record" {
                $r
            } else {
                {value: ($r | into string)}
            }
        }
    } else {
        [{result: ($results | into string)}]
    }
}