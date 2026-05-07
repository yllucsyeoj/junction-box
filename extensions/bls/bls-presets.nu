use _shared.nu *
# Fetch popular BLS preset series: CPI-U, Unemployment Rate, Total Employment, Avg Hourly Earnings, PPI. Returns a table with series_id, name, date, value. Uses BLS_API_KEY from .env (500 queries/day registered, 25/day unregistered).
@category bls
export def "prim-bls-presets" [
]: nothing -> table {
    let key = (try { $env.BLS_API_KEY } catch { "" })
    let ids = ($BLS_PRESETS | values)
    let current_year = ((date now) | format date "%Y")
    let start = (($current_year | into int) - 10)
    let end   = ($current_year | into int)
    if not ($key | is-empty) {
        bls_fetch_series ($ids | str join ",") $start $end
    } else {
        mut rows = []
        for $sid in $ids {
            $rows = ($rows | append (bls_fetch_series $sid $start $end))
        }
        $rows
    }
}
