# Fetch FRED economic indicator observations. Returns a table with date, value. Common IDs: GDPC1 (GDP), CPIAUCSL (CPI), FEDFUNDS (Fed Funds Rate), DGS10 (10Y Yield), M2SL (M2), UNRATE (Unemployment), INDPRO (Industrial Production), RRSFS (Retail Sales). Uses FRED_API_KEY from .env if available.
@category fred
export def "prim-fred-series" [
    --series_id:    string = "GDPC1" # [wirable] FRED series ID (e.g. GDPC1, CPIAUCSL, FEDFUNDS, UNRATE)
    --start:        string = ""      # Start date (YYYY-MM-DD, default: 10 years ago)
    --end:          string = ""      # End date (YYYY-MM-DD, default: today)
    --units:        string = "lin"   # Units: lin (level), chg (change), chgpct (pct change)
    --limit:        string = "1000"  # Max observations
]: nothing -> table {
    const FRED_UA = "Mozilla/5.0 (compatible; junction-box-fred/1.0)"
    let key = (try { $env.FRED_API_KEY } catch { "" })
    if ($key | is-empty) {
        error make {msg: "FRED_API_KEY not set in .env — get a free key at fred.stlouisfed.org/docs/api/api_key.html"}
    }
    let today = (date now | format date "%Y-%m-%d")
    let current_year_str = (date now | format date "%Y")
    let ten_yrs_ago_year = (($current_year_str | into int) - 10 | into string)
    let ten_yrs_ago = $"($ten_yrs_ago_year)-01-01"
    let s = if ($start | is-empty) { $ten_yrs_ago } else { $start }
    let e = if ($end | is-empty)   { $today       } else { $end }
    let series_id_val = if ($series_id | str starts-with '"') { try { $series_id | from json } catch { $series_id } } else { $series_id }
    # Lightweight pre-check: verify series exists before fetching observations
    let verify_url = ({
        scheme: "https",
        host: "api.stlouisfed.org",
        path: "/fred/series",
        params: {
            series_id: $series_id_val,
            api_key: $key,
            file_type: "json"
        }
    } | url join)
    let verify = (try { http get -H {User-Agent: $FRED_UA} $verify_url } catch { null })
    let has_series = (try { $verify.seriess | length | $in > 0 } catch { false })
    if not $has_series {
        error make {msg: $"FRED series ID '($series_id_val)' not found. Verify the ID at fred.stlouisfed.org/series/($series_id_val)"}
    }
    let url = ({
        scheme: "https",
        host: "api.stlouisfed.org",
        path: "/fred/series/observations",
        params: {
            series_id: $series_id_val,
            api_key: $key,
            file_type: "json",
            observation_start: $s,
            observation_end: $e,
            units: $units,
            limit: ($limit | into int | into string)
        }
    } | url join)

    # Use curl for better HTTP error handling — Nu's http get swallows 400 response bodies.
    let curl_out = (try {
        (^curl -s -w "\n__HTTP_STATUS:%{http_code}" -H $"User-Agent: ($FRED_UA)" $url)
    } catch {|e|
        error make {msg: $"FRED request failed: ($e.msg)"}
    })
    let status_line = ($curl_out | lines | where {|l| $l | str starts-with '__HTTP_STATUS:'} | first)
    let status = ($status_line | str replace '__HTTP_STATUS:' '' | into int)
    let body = ($curl_out | lines | where {|l| not ($l | str starts-with '__HTTP_STATUS:')} | str join "\n")

    if $status != 200 {
        let err_detail = (try { $body | from json | get error_message } catch { "" })
        let err_msg = if ($err_detail | is-not-empty) { $err_detail } else { $"HTTP ($status)" }
        error make {msg: $"FRED API error for series ($series_id_val): ($err_msg)"}
    }

    let raw = ($body | from json)
    let observations = (try { $raw.observations } catch { [] })
    $observations | each {|o|
        let v = (try { $o.value } catch { "." })
        {
            date:  (try { $o.date  } catch { "" })
            value: (if $v == "." { null } else { $v | into float })
        }
    } | where value != null
}
