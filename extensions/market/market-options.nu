use _shared.nu *
# Fetch options chain for a stock ticker from CBOE delayed quotes (~15min delay). Filter by expiry date or type.
@category market
export def "prim-market-options" [
    --ticker: string = ""     # [wirable][required] Stock ticker symbol (equities only)
    --expiry: string = ""     # ISO date filter e.g. 2026-05-16 (default: nearest with volume)
    --type:   string = "both" # [options:both,calls,puts] Option type filter
    --limit:  string = "25"   # Max rows per type
]: nothing -> table {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym  = ($ticker_val | str upcase)
    let raw  = (http get
        -H {User-Agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
        $"https://cdn.cboe.com/api/global/delayed_quotes/options/($sym).json")
    let opts = $raw.data.options

    if ($opts | is-empty) {
        error make {msg: $"No options data found for ($sym)"}
    }

    let parsed = ($opts | each {|o|
        let meta = (mkt_parse_option_symbol $o.option $sym)
        {
            ticker:           $sym
            expiry:           $meta.expiry
            type:             $meta.type
            strike:           $meta.strike
            bid:              $o.bid
            ask:              $o.ask
            last:             $o.last_trade_price
            volume:           ($o.volume       | into int)
            open_interest:    ($o.open_interest | into int)
            iv:               $o.iv
            delta:            $o.delta
            gamma:            $o.gamma
            theta:            $o.theta
            vega:             $o.vega
            change_pct:       $o.percent_change
        }
    })

    let target_expiry = if ($expiry | is-not-empty) {
        $expiry
    } else {
        $parsed | where volume > 0 | get expiry | sort | first
    }

    let n = ($limit | into int)
    let filtered = ($parsed | where expiry == $target_expiry | sort-by strike)
    let calls = ($filtered | where type == "call" | first $n)
    let puts  = ($filtered | where type == "put"  | last  $n)

    match $type {
        "calls" => { $calls }
        "puts"  => { $puts }
        _       => { $calls | append $puts }
    }
}
