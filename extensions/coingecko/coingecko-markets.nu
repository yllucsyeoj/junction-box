# Fetch top cryptocurrencies by market cap from CoinGecko. Returns a table with symbol, name, current_price, market_cap, market_cap_rank, price_change_24h_pct, total_volume, image.
@category coingecko
export def "prim-coingecko-markets" [
    --vs:     string = "usd"           # Vs currency
    --limit:  string = "20"            # Max results (max 250)
    --order:  string = "market_cap_desc" # Sort order (market_cap_desc, volume_desc, etc.)
]: nothing -> table {
    const CG_UA = "Mozilla/5.0 (compatible; junction-box-coingecko/1.0)"
    let url = ({
        scheme: "https",
        host: "api.coingecko.com",
        path: "/api/v3/coins/markets",
        params: {
            vs_currency: $vs,
            order: $order,
            per_page: ($limit | into int | into string),
            page: "1",
            sparkline: "false"
        }
    } | url join)
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
