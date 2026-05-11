# Run a predefined Yahoo Finance stock screener. Returns a table of top matches with price, P/E, market cap, etc.
@category market
export def "prim-market-screener" [
    --screen: string = "most_actives" # [options:most_actives,day_gainers,day_losers,undervalued_growth_stocks,growth_technology_stocks,aggressive_small_caps,undervalued_large_caps,most_shorted_stocks] Screener preset
    --limit:  string = "20"           # Max results (up to ~25 for free tier)
]: nothing -> table {
    let url = ({
        scheme: "https",
        host: "query1.finance.yahoo.com",
        path: "/v1/finance/screener/predefined/saved",
        params: {
            scrIds: $screen,
            count: ($limit | into int | into string),
            region: "US",
            lang: "en-US"
        }
    } | url join)
    let raw = (http get -H {User-Agent: "research-tool admin@example.com"} $url)

    let result = ($raw | get finance.result)
    if ($result | is-empty) {
        error make {msg: $"No results for screen '($screen)' — check the screen id"}
    }

    ($result | first | get quotes) | each {|q|
        {
            symbol:         ($q | get --optional symbol                        | default null)
            name:           ($q | get --optional shortName                     | default null)
            price:          ($q | get --optional regularMarketPrice            | default null)
            change_pct:     ($q | get --optional regularMarketChangePercent    | default null)
            volume:         ($q | get --optional regularMarketVolume           | default null)
            avg_volume:     ($q | get --optional averageDailyVolume3Month      | default null)
            market_cap:     ($q | get --optional marketCap                     | default null)
            pe_trailing:    ($q | get --optional trailingPE                    | default null)
            pe_forward:     ($q | get --optional forwardPE                     | default null)
            eps_ttm:        ($q | get --optional epsTrailingTwelveMonths       | default null)
            week_52_change: ($q | get --optional fiftyTwoWeekChangePercent     | default null)
            analyst_rating: ($q | get --optional averageAnalystRating          | default null)
            exchange:       ($q | get --optional fullExchangeName              | default null)
        }
    }
}
