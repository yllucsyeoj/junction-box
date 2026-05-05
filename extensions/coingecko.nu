# GoNude CoinGecko extension
# Nodes: global, simple, markets
# Source: api.coingecko.com/api/v3 — free tier, 30 calls/min, 10k/month

export const COINGECKO_PRIMITIVE_META = {
    coingecko_global: {
        category: "coingecko"
        color: "#6c46c7"
        wirable: []
        agent_hint: "Fetch global crypto market overview from CoinGecko. Returns a record with total_market_cap_usd, btc_dominance_pct, total_volume_usd, active_cryptocurrencies, market_cap_change_24h_pct."
        param_options: {}
    }
    coingecko_simple: {
        category: "coingecko"
        color: "#6c46c7"
        wirable: ["ids"]
        agent_hint: "Fetch price, market cap, 24h change for specific coin IDs from CoinGecko. Returns a record keyed by coin ID with price, market_cap, 24h_change, 24h_volume. Use --ids to specify coins (e.g. bitcoin,ethereum)."
        param_options: {}
    }
    coingecko_markets: {
        category: "coingecko"
        color: "#6c46c7"
        wirable: []
        agent_hint: "Fetch top cryptocurrencies by market cap from CoinGecko. Returns a table with symbol, name, current_price, market_cap, market_cap_rank, price_change_24h_pct, total_volume, image."
        param_options: {}
    }
}

const CG_UA = "Mozilla/5.0 (compatible; junction-box-coingecko/1.0)"

# ── Primitives ────────────────────────────────────────────────────────────────

# Global crypto market data
export def "prim-coingecko-global" []: nothing -> record {
    let url = "https://api.coingecko.com/api/v3/global"
    let raw = (http get -H {User-Agent: $CG_UA} $url)
    let data = $raw.data
    {
        total_market_cap_usd:     (try { $data.total_market_cap.usd     } catch { 0.0 })
        total_volume_usd:         (try { $data.total_volume.usd         } catch { 0.0 })
        btc_dominance_pct:        (try { $data.market_cap_percentage.btc } catch { 0.0 })
        active_cryptocurrencies:  (try { $data.active_cryptocurrencies  } catch { 0 })
        market_cap_change_24h_pct: (try { $data.market_cap_change_percentage_24h_usd } catch { 0.0 })
    }
}

# Simple price for specific coin IDs
export def "prim-coingecko-simple" [
    --ids:     string = "bitcoin" # Comma-separated coin IDs (e.g. bitcoin,ethereum,solana)
    --vs:      string = "usd"     # Vs currency (usd, eur, gbp, etc.)
    --include_market_cap: string = "true" # Include market cap (true/false)
    --include_24h_vol:     string = "true" # Include 24h volume (true/false)
]: nothing -> record {
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

# Top cryptocurrencies by market cap
export def "prim-coingecko-markets" [
    --vs:     string = "usd"    # Vs currency
    --limit:  string = "20"    # Max results (max 250)
    --order:  string = "market_cap_desc" # Sort order (market_cap_desc, volume_desc, etc.)
]: nothing -> table {
    let url = $"https://api.coingecko.com/api/v3/coins/markets?vs_currency=($vs)&order=($order)&per_page=($limit | into int)&page=1&sparkline=false"
    let raw = (http get -H {User-Agent: $CG_UA} $url)
    $raw | each {|coin|
        {
            symbol:             (try { $coin.symbol           } catch { "" })
            name:               (try { $coin.name             } catch { "" })
            current_price:      (try { $coin.current_price    } catch { 0.0 })
            market_cap:         (try { $coin.market_cap      } catch { 0.0 })
            market_cap_rank:    (try { $coin.market_cap_rank } catch { 0 })
            price_change_24h_pct: (try { $coin.price_change_percentage_24h } catch { 0.0 })
            total_volume:       (try { $coin.total_volume     } catch { 0.0 })
            image:              (try { $coin.image            } catch { "" })
        }
    }
}