use _shared.nu *
# Fetch BLS labor/economic data by series ID. Returns a table with series_id, name, date, value. Common IDs: CUUR0000SA0 (CPI-U), LNS14000000 (Unemployment), CES0000000001 (Employment), CES0500000003 (Avg Hourly Earnings), WPSFD4 (PPI). Pass --series_ids as comma-separated list. Registered: 500 queries/day, 50 series/query, 20 years. Unregistered: 25 queries/day. Uses BLS_API_KEY from .env if available.
@category bls
export def "prim-bls-series" [
    --series_ids: string = "CUUR0000SA0" # [wirable] Comma-separated BLS series IDs (e.g. CUUR0000SA0,LNS14000000)
    --start_year: string = ""            # Start year (default: 10 years ago)
    --end_year:   string = ""            # End year (default: current year)
]: nothing -> table {
    let current_year = ((date now) | format date "%Y")
    let start = if ($start_year | is-empty) { (($current_year | into int) - 10) } else { $start_year | into int }
    let end   = if ($end_year | is-empty)   { $current_year | into int } else { $end_year | into int }
    let series_ids_val = if ($series_ids | str starts-with '"') { try { $series_ids | from json } catch { $series_ids } } else { $series_ids }
    bls_fetch_series $series_ids_val $start $end
}
