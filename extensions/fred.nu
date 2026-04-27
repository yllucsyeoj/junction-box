# GoNude FRED extension
# Nodes: series, search
# Source: api.stlouisfed.org/fred — requires free API key
# Register: fred.stlouisfed.org/docs/api/api_key.html

export const FRED_PRIMITIVE_META = {
    fred_series: {
        category: "fred"
        color: "#059669"
        wirable: []
        agent_hint: "Fetch FRED economic indicator observations. Returns a table with date, value. Common IDs: GDPC1 (GDP), CPALTT01USM659S (CPI), FEDFUNDS (Fed Funds Rate), DGS10 (10Y Yield), M2SL (M2), UNRATE (Unemployment), INDPRO (Industrial Production), RRSFS (Retail Sales). Uses FRED_API_KEY from .env if available."
        param_options: {}
    }
    fred_search: {
        category: "fred"
        color: "#059669"
        wirable: []
        agent_hint: "Search FRED series by keyword. Returns a table with series_id, title, start_date, end_date, frequency, units. Use to discover series IDs for fred_series node."
        param_options: {}
    }
}

const FRED_UA = "Mozilla/5.0 (compatible; junction-box-fred/1.0)"

# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch observations for a FRED series
export def "prim-fred-series" [
    --series_id:    string = "GDPC1" # FRED series ID (e.g. GDPC1, CPI, FEDFUNDS, UNRATE)
    --start:        string = ""      # Start date (YYYY-MM-DD, default: 10 years ago)
    --end:          string = ""      # End date (YYYY-MM-DD, default: today)
    --units:        string = "lin"   # Units: lin (level), chg (change), chgpct (pct change)
    --limit:        string = "1000"  # Max observations
]: nothing -> table {
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
    let url = $"https://api.stlouisfed.org/fred/series/observations?series_id=($series_id)&api_key=($key)&file_type=json&observation_start=($s)&observation_end=($e)&units=($units)&limit=($limit | into int)"
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

# Search FRED series by keyword
export def "prim-fred-search" [
    --query: string = "gdp"     # Search keyword
    --limit: string = "20"      # Max results
]: nothing -> table {
    let key = (try { $env.FRED_API_KEY } catch { "" })
    if ($key | is-empty) {
        error make {msg: "FRED_API_KEY not set in .env — get a free key at fred.stlouisfed.org/docs/api/api_key.html"}
    }
    let q = ($query | url encode)
    let url = $"https://api.stlouisfed.org/fred/series/search?search_text=($q)&api_key=($key)&file_type=json&limit=($limit | into int)"
    let raw = (http get -H {User-Agent: $FRED_UA} $url)
    let results = (try { $raw.seriess } catch { [] })
    $results | each {|s|
        {
            series_id:  (try { $s.id   } catch { "" })
            title:      (try { $s.title } catch { "" })
            start_date: (try { $s.start } catch { "" })
            end_date:   (try { $s.end   } catch { "" })
            frequency:  (try { $s.frequency } catch { "" })
            units:      (try { $s.units } catch { "" })
        }
    }
}