# Fetch OHLCV price history for any ticker via Yahoo Finance. interval: 1m 5m 15m 1h 1d 1wk 1mo. range: 1mo 3mo 6mo 1y 2y 5y ytd max.
@category market
export def "prim-market-history" [
    --ticker:   string = ""   # [wirable][required] Ticker symbol — stocks, crypto (BTC-USD), forex (EURUSD=X), indices (^GSPC)
    --interval: string = "1d" # [options:1d,1wk,1mo,1h,15m,5m,1m] Bar interval
    --range:    string = "1y" # [options:1y,6mo,3mo,1mo,2y,5y,ytd,max] Date range
]: nothing -> table {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym = ($ticker_val | str upcase)
    let url = $"https://query1.finance.yahoo.com/v8/finance/chart/($sym)?interval=($interval)&range=($range)"
    let raw = (http get -H {User-Agent: "research-tool admin@example.com"} $url)

    let result = ($raw.chart.result | first)
    let ts     = $result.timestamp
    let q      = ($result.indicators.quote | first)

    if ($ts | is-empty) {
        error make {msg: $"No price data for ($sym) — market may be closed or range/interval is invalid"}
    }

    $ts | enumerate | each {|it|
        let i = $it.index
        {
            date:   ($it.item * 1_000_000_000 | into datetime | format date "%Y-%m-%d")
            open:   ($q.open   | get $i)
            high:   ($q.high   | get $i)
            low:    ($q.low    | get $i)
            close:  ($q.close  | get $i)
            volume: ($q.volume | get $i)
        }
    }
}
