# Fetch FRED economic indicator observations. Returns a table with date, value. Common IDs: GDPC1 (GDP), CPALTT01USM659S (CPI), FEDFUNDS (Fed Funds Rate), DGS10 (10Y Yield), M2SL (M2), UNRATE (Unemployment), INDPRO (Industrial Production), RRSFS (Retail Sales). Uses FRED_API_KEY from .env if available.
@category fred
export def "prim-fred-series" [
    --series_id:    string = "GDPC1" # [wirable] FRED series ID (e.g. GDPC1, CPI, FEDFUNDS, UNRATE)
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
    let verify_url = $"https://api.stlouisfed.org/fred/series?series_id=($series_id_val)&api_key=($key)&file_type=json"
    let verify = (try { http get -H {User-Agent: $FRED_UA} $verify_url } catch { null })
    let has_series = (try { $verify.seriess | length | $in > 0 } catch { false })
    if not $has_series {
        error make {msg: $"FRED series ID '($series_id_val)' not found. Verify the ID at fred.stlouisfed.org/series/($series_id_val)"}
    }
    let url = $"https://api.stlouisfed.org/fred/series/observations?series_id=($series_id_val)&api_key=($key)&file_type=json&observation_start=($s)&observation_end=($e)&units=($units)&limit=($limit | into int)"
    let raw = (http get -H {User-Agent: $FRED_UA} $url)
    let observations = (try { $raw.observations } catch { [] })
    $observations | each {|o|
        let v = (try { $o.value } catch { "." })
        {
            date:  (try { $o.date  } catch { "" })
            value: (if $v == "." { null } else { $v | into float })
        }
    } | where value != null
}
