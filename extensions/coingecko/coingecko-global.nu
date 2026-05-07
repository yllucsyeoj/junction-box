# Fetch global crypto market overview from CoinGecko. Returns a record with total_market_cap_usd, btc_dominance_pct, total_volume_usd, active_cryptocurrencies, market_cap_change_24h_pct.
@category coingecko
export def "prim-coingecko-global" []: nothing -> record {
    const CG_UA = "Mozilla/5.0 (compatible; junction-box-coingecko/1.0)"
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
