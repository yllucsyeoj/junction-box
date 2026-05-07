export const BLS_PRESETS = {
    CPI:          "CUUR0000SA0"
    Unemployment: "LNS14000000"
    Employment:   "CES0000000001"
    Wages:        "CES0500000003"
    PPI:          "WPSFD4"
}

export def bls_parse_row [series_id: string, d: any] {
    {
        series_id: $series_id
        year:      (try { $d.year   } catch { 0 })
        period:    (try { $d.period } catch { "" })
        date:      (try { $"($d.year)-($d.period)" } catch { "" })
        value:     (try { $d.value | into float } catch { 0.0 })
    }
}

# Core BLS fetch logic — shared by bls-series and bls-presets nodes
export def bls_fetch_series [series_ids_val: string, start: int, end: int] {
    let key = (try { $env.BLS_API_KEY } catch { "" })
    let ids = ($series_ids_val | split row "," | each {|s| $s | str trim })

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
            seriesid: $ids,
            startyear: ($start | into string),
            endyear:   ($end | into string),
            registrationkey: $key
        }
        let raw = (http post
            -H {Content-Type: "application/json"}
            $"https://api.bls.gov/publicAPI/v2/timeseries/data/"
            ($payload | to json))
        let api_status = (try { $raw.status } catch { "" })
        if $api_status != "REQUEST_SUCCEEDED" {
            error make {msg: $"BLS API error: ($api_status) — ($raw.message? | default "unknown")"}
        }
        let results = (try { $raw.Results.series } catch { [] })
        if ($results | is-empty) {
            error make {msg: "BLS API returned no data. Check series IDs and API key validity."}
        }
        mut all_rows = []
        for $series in $results {
            let sid  = (try { $series.seriesID } catch { "" })
            let sdata = (try { $series.data } catch { [] })
            let new_rows = ($sdata | each {|d| bls_parse_row $sid $d })
            $all_rows = ($all_rows | append $new_rows)
        }
        $all_rows
    }
}
