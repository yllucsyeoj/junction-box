# Fetch price, market cap, 24h change for specific coin IDs from CoinGecko. Returns a record keyed by coin ID with price, market_cap, 24h_change, 24h_volume. Use --ids to specify coins (e.g. bitcoin,ethereum).
@category coingecko
export def "prim-coingecko-simple" [
    --ids:     string = "bitcoin" # [wirable] Comma-separated coin IDs (e.g. bitcoin,ethereum,solana)
    --vs:      string = "usd"     # Vs currency (usd, eur, gbp, etc.)
    --include_market_cap: string = "true" # Include market cap (true/false)
    --include_24h_vol:     string = "true" # Include 24h volume (true/false)
]: nothing -> record {
    const CG_UA = "Mozilla/5.0 (compatible; junction-box-coingecko/1.0)"
    let ids_val = if ($ids | str starts-with '"') { try { $ids | from json } catch { $ids } } else { $ids }
    let url = $"https://api.coingecko.com/api/v3/simple/price?ids=($ids_val)&vs_currencies=($vs)&include_market_cap=($include_market_cap)&include_24hr_vol=($include_24h_vol)&include_24hr_change=true"
    let raw = (http get -H {User-Agent: $CG_UA} $url)
    let coin_ids = ($ids_val | split row "," | each {|id| $id | str trim })
    mut result = {}
    for $cid in $coin_ids {
        if ($cid in $raw) {
            let coin_data = ($raw | get $cid)
            let entry = {
                symbol: $cid
                price:  (try { $coin_data | get $vs } catch { 0.0 })
            }
            if $include_market_cap == "true" {
                let mcap_key = ($"($vs)_market_cap" | into string)
                let entry = ($entry | merge { market_cap: (try { $coin_data | get $mcap_key } catch { 0.0 }) })
            }
            if $include_24h_vol == "true" {
                let vol_key = ($"($vs)_24h_vol" | into string)
                let entry = ($entry | merge { vol_24h: (try { $coin_data | get $vol_key } catch { 0.0 }) })
            }
            let entry = ($entry | merge { change_24h: (try { $coin_data | get $"($vs)_24h_change" } catch { 0.0 }) })
            $result = ($result | merge {($cid): $entry})
        }
    }
    $result
}
