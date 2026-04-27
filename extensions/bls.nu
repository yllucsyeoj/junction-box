# GoNude BLS extension
# Nodes: series, presets
# Source: api.bls.gov — requires free API key for POST bulk queries
# Register: data.bls.gov/registrationEngine — 25 queries/day free without key, 500/day with key
# Note: Bulk POST requires key; single-series GET works without key.

export const BLS_PRIMITIVE_META = {
    bls_series: {
        category: "bls"
        color: "#0891b2"
        wirable: []
        agent_hint: "Fetch BLS labor/economic data by series ID. Returns a table with series_id, name, date, value. Common IDs: CUUR0000SA0 (CPI-U), LNS14000000 (Unemployment), CES0000000001 (Employment), CES0500000003 (Avg Hourly Earnings), WPSFD4 (PPI). Pass --series_ids as comma-separated list. Registered: 500 queries/day, 50 series/query, 20 years. Unregistered: 25 queries/day. Uses BLS_API_KEY from .env if available."
        param_options: {}
    }
    bls_presets: {
        category: "bls"
        color: "#0891b2"
        wirable: []
        agent_hint: "Fetch popular BLS preset series: CPI-U, Unemployment Rate, Total Employment, Avg Hourly Earnings, PPI. Returns a table with series_id, name, date, value. Uses BLS_API_KEY from .env (500 queries/day registered, 25/day unregistered)."
        param_options: {}
    }
}

const BLS_PRESETS = {
    CPI:          "CUUR0000SA0"
    Unemployment: "LNS14000000"
    Employment:   "CES0000000001"
    Wages:        "CES0500000003"
    PPI:          "WPSFD4"
}

def bls_parse_row [series_id: string, d: any] {
    {
        series_id: $series_id
        year:      (try { $d.year   } catch { 0 })
        period:    (try { $d.period } catch { "" })
        date:      (try { $"($d.year)-($d.period)" } catch { "" })
        value:     (try { $d.value | into float } catch { 0.0 })
    }
}

# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch one or more BLS series by ID
export def "prim-bls-series" [
    --series_ids: string = "CUUR0000SA0" # Comma-separated BLS series IDs (e.g. CUUR0000SA0,LNS14000000)
    --start_year: string = ""           # Start year (default: 10 years ago)
    --end_year:   string = ""           # End year (default: current year)
]: nothing -> table {
    let key = (try { $env.BLS_API_KEY } catch { "" })
    let current_year = ((date now) | format date "%Y")
    let start = if ($start_year | is-empty) { (($current_year | into int) - 10) } else { $start_year | into int }
    let end   = if ($end_year | is-empty)   { $current_year | into int } else { $end_year | into int }
    let ids = ($series_ids | split row "," | each {|s| $s | str trim })

    if ($ids | length) == 1 {
        let sid  = $ids | first
        let url  = $"https://api.bls.gov/publicAPI/v2/timeseries/data/($sid)?start_year=($start)&end_year=($end)"
        let raw  = (http get $url)
        let rows = (try { $raw.Results.series.0.data } catch { [] })
        $rows | each {|d| bls_parse_row $sid $d }
    } else {
        if ($key | is-empty) {
            error make {msg: "Multi-series BLS queries require BLS_API_KEY. Register free at data.bls.gov/registrationEngine"}
        }
        let payload = {
            series_id: $ids,
            start_year: $start,
            end_year:   $end,
            api_key: $key
        }
        let raw = (http post
            -H {Content-Type: "application/json"}
            $"https://api.bls.gov/publicAPI/v2/timeseries/data/"
            ($payload | to json))
        let results = (try { $raw.Results.series } catch { [] })
        let all_rows = []
        for $series in $results {
            let sid  = (try { $series.seriesID } catch { "" })
            let sdata = (try { $series.data } catch { [] })
            let new_rows = ($sdata | each {|d| bls_parse_row $sid $d })
            let all_rows = ($all_rows | append $new_rows)
        }
        $all_rows
    }
}

# Fetch preset BLS series (requires BLS_API_KEY for multi-series)
export def "prim-bls-presets" [
]: nothing -> table {
    let key = (try { $env.BLS_API_KEY } catch { "" })
    let ids = ($BLS_PRESETS | values)
    if not ($key | is-empty) {
        prim-bls-series --series_ids ($ids | str join ",")
    } else {
        let rows = (prim-bls-series --series_ids ($ids.0))
        let rows = ($rows | append (prim-bls-series --series_ids ($ids.1)))
        let rows = ($rows | append (prim-bls-series --series_ids ($ids.2)))
        let rows = ($rows | append (prim-bls-series --series_ids ($ids.3)))
        let rows = ($rows | append (prim-bls-series --series_ids ($ids.4)))
        $rows
    }
}