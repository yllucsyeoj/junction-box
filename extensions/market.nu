# GoNude market data extension
# Nodes: snapshot, history, screener, symbols, options
# Sources: Finviz (snapshot), Yahoo Finance v8 (history, screener), CBOE (options)
# No API keys required.

export const MARKET_PRIMITIVE_META = {
    market_snapshot: {
        category: "market"
        color: "#10b981"
        wirable: []
        agent_hint: "Fetch key stats for a stock ticker from Finviz: price, P/E, market cap, margins, analyst target, etc."
        param_options: {}
    }
    market_history: {
        category: "market"
        color: "#10b981"
        wirable: []
        agent_hint: "Fetch OHLCV price history for any ticker via Yahoo Finance. interval: 1m 5m 15m 1h 1d 1wk 1mo. range: 1mo 3mo 6mo 1y 2y 5y ytd max."
        param_options: {
            interval: ["1d", "1wk", "1mo", "1h", "15m", "5m", "1m"]
            range: ["1y", "6mo", "3mo", "1mo", "2y", "5y", "ytd", "max"]
        }
    }
    market_screener: {
        category: "market"
        color: "#10b981"
        wirable: []
        agent_hint: "Run a predefined Yahoo Finance stock screener. Returns a table of top matches with price, P/E, market cap, etc."
        param_options: {
            screen: ["most_actives", "day_gainers", "day_losers", "undervalued_growth_stocks", "growth_technology_stocks", "aggressive_small_caps", "undervalued_large_caps", "most_shorted_stocks"]
        }
    }
    market_symbols: {
        category: "market"
        color: "#10b981"
        wirable: []
        agent_hint: "Look up known non-equity symbols (crypto, forex, commodities, indices). Filter by --type or --search."
        param_options: {
            type: ["crypto", "forex", "commodity", "index"]
        }
    }
    market_options: {
        category: "market"
        color: "#10b981"
        wirable: []
        agent_hint: "Fetch options chain for a stock ticker from CBOE delayed quotes (~15min delay). Filter by expiry date or type."
        param_options: {
            type: ["both", "calls", "puts"]
        }
    }
}

# ── Private helpers ───────────────────────────────────────────────────────────

const FINVIZ_URL = "https://finviz.com/quote.ashx?t="
const FINVIZ_UA  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def mkt_parse_stats [html: string]: nothing -> record {
    let cells = (
        $html
        | query web --query "table.snapshot-table2 td"
        | each {|c| $c | str join "" | str trim}
    )
    $cells | chunks 2 | reduce --fold {} {|pair, acc|
        $acc | upsert ($pair | get 0) ($pair | get 1)
    }
}

def mkt_to_f []: string -> float {
    $in | str trim | str replace --all ',' '' | str replace --regex '%$' '' | into float
}

def mkt_to_magnitude []: string -> float {
    let s      = ($in | str trim | str replace --all ',' '')
    let suffix = ($s | str substring (($s | str length) - 1)..)
    let num    = ($s | str replace --regex '[BMKT]$' '' | into float)
    match $suffix {
        "B" => ($num * 1_000_000_000)
        "M" => ($num * 1_000_000)
        "K" => ($num * 1_000)
        "T" => ($num * 1_000_000_000_000)
        _   => $num
    }
}

def mkt_pct_f []: string -> float {
    $in | str trim | str replace --regex '%$' '' | into float
}

def mkt_first_num_f []: string -> float {
    $in | split row ' ' | first | str trim | into float
}

def mkt_paren_pct_f []: string -> float {
    let m = ($in | parse --regex '\(([0-9.]+)%\)')
    if ($m | is-empty) { 0.0 } else { $m | first | get capture0 | into float }
}

def mkt_parse_option_symbol [sym: string, ticker: string]: nothing -> record {
    let tl     = ($ticker | str length)
    let ds     = ($sym | str substring $tl..($tl + 5))
    let typ    = ($sym | str substring ($tl + 6)..($tl + 6))
    let sk     = ($sym | str substring ($tl + 7)..)
    let expiry = $"20($ds | str substring 0..1)-($ds | str substring 2..3)-($ds | str substring 4..5)"
    let strike = (($sk | into int) / 1000)
    {expiry: $expiry, type: (if $typ == "C" { "call" } else { "put" }), strike: $strike}
}

# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch key-stats snapshot for a stock ticker via Finviz
export def "prim-market-snapshot" [
    --ticker: string = ""           # Stock ticker symbol (e.g. AAPL, MSFT)
]: nothing -> record {
    let sym  = ($ticker | str upcase)
    let html = (http get -H {User-Agent: $FINVIZ_UA} $"($FINVIZ_URL)($sym)")

    let name = (
        $html | query web --query "h2.quote-header_ticker-wrapper_company a"
        | first | str join "" | str trim
    )

    let s = (mkt_parse_stats $html)
    let g = {|k| $s | get --optional $k}

    {
        ticker:           $sym
        name:             $name
        price:            (try { do $g "Price"         | mkt_to_f          } catch { null })
        prev_close:       (try { do $g "Prev Close"    | mkt_to_f          } catch { null })
        day_change_pct:   (try { do $g "Change"        | mkt_pct_f         } catch { null })
        market_cap:       (try { do $g "Market Cap"    | mkt_to_magnitude  } catch { null })
        week_52_high:     (try { do $g "52W High"      | mkt_first_num_f   } catch { null })
        week_52_low:      (try { do $g "52W Low"       | mkt_first_num_f   } catch { null })
        volume:           (try { do $g "Volume"        | str replace --all ',' '' | into int } catch { null })
        avg_volume:       (try { do $g "Avg Volume"    | mkt_to_magnitude  } catch { null })
        pe_trailing:      (try { do $g "P/E"           | mkt_to_f          } catch { null })
        pe_forward:       (try { do $g "Forward P/E"   | mkt_to_f          } catch { null })
        peg_ratio:        (try { do $g "PEG"           | mkt_to_f          } catch { null })
        price_to_book:    (try { do $g "P/B"           | mkt_to_f          } catch { null })
        ev_ebitda:        (try { do $g "EV/EBITDA"     | mkt_to_f          } catch { null })
        eps_ttm:          (try { do $g "EPS (ttm)"     | mkt_to_f          } catch { null })
        revenue:          (try { do $g "Sales"         | mkt_to_magnitude  } catch { null })
        gross_margin:     (try { do $g "Gross Margin"  | mkt_pct_f         } catch { null })
        operating_margin: (try { do $g "Oper. Margin"  | mkt_pct_f         } catch { null })
        profit_margin:    (try { do $g "Profit Margin" | mkt_pct_f         } catch { null })
        roe:              (try { do $g "ROE"            | mkt_pct_f         } catch { null })
        roa:              (try { do $g "ROA"            | mkt_pct_f         } catch { null })
        analyst_target:   (try { do $g "Target Price"  | mkt_to_f          } catch { null })
        recommendation:   (try { do $g "Recom"         | mkt_to_f          } catch { null })
        debt_to_equity:   (try { do $g "Debt/Eq"       | mkt_to_f          } catch { null })
        beta:             (try { do $g "Beta"           | mkt_to_f          } catch { null })
        dividend_yield:   (try { do $g "Dividend TTM"  | mkt_paren_pct_f   } catch { null })
        short_ratio:      (try { do $g "Short Ratio"   | mkt_to_f          } catch { null })
        employees:        (try { do $g "Employees"     | str replace --all ',' '' | into int } catch { null })
    }
}

# Fetch OHLCV price history for any ticker via Yahoo Finance
export def "prim-market-history" [
    --ticker:   string = ""     # Ticker symbol — stocks, crypto (BTC-USD), forex (EURUSD=X), indices (^GSPC)
    --interval: string = "1d"   # Bar interval: 1m 5m 15m 1h 1d 1wk 1mo
    --range:    string = "1y"   # Date range: 1mo 3mo 6mo 1y 2y 5y ytd max
]: nothing -> table {
    let sym = ($ticker | str upcase)
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

# Run a predefined Yahoo Finance stock screener
export def "prim-market-screener" [
    --screen: string = "most_actives"   # Screen: most_actives day_gainers day_losers undervalued_growth_stocks growth_technology_stocks aggressive_small_caps undervalued_large_caps most_shorted_stocks
    --limit:  string = "20"             # Max results (up to ~25 for free tier)
]: nothing -> table {
    let url = $"https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=($screen)&count=($limit | into int)&region=US&lang=en-US"
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

# Look up known non-equity symbols (crypto, forex, commodities, indices)
export def "prim-market-symbols" [
    --type:   string = ""   # Filter by type: crypto, forex, commodity, index
    --search: string = ""   # Case-insensitive search on name or symbol
]: nothing -> table {
    let all = [
        {symbol: "BTC-USD",   name: "Bitcoin",                            type: "crypto",    category: ""}
        {symbol: "ETH-USD",   name: "Ethereum",                           type: "crypto",    category: ""}
        {symbol: "SOL-USD",   name: "Solana",                             type: "crypto",    category: ""}
        {symbol: "XRP-USD",   name: "XRP",                                type: "crypto",    category: ""}
        {symbol: "BNB-USD",   name: "BNB",                                type: "crypto",    category: ""}
        {symbol: "ADA-USD",   name: "Cardano",                            type: "crypto",    category: ""}
        {symbol: "DOGE-USD",  name: "Dogecoin",                           type: "crypto",    category: ""}
        {symbol: "AVAX-USD",  name: "Avalanche",                          type: "crypto",    category: ""}
        {symbol: "LINK-USD",  name: "Chainlink",                          type: "crypto",    category: ""}
        {symbol: "MATIC-USD", name: "Polygon",                            type: "crypto",    category: ""}
        {symbol: "EURUSD=X",  name: "Euro / US Dollar",                   type: "forex",     category: "g10"}
        {symbol: "GBPUSD=X",  name: "British Pound / US Dollar",          type: "forex",     category: "g10"}
        {symbol: "USDJPY=X",  name: "US Dollar / Japanese Yen",           type: "forex",     category: "g10"}
        {symbol: "USDCHF=X",  name: "US Dollar / Swiss Franc",            type: "forex",     category: "g10"}
        {symbol: "AUDUSD=X",  name: "Australian Dollar / US Dollar",      type: "forex",     category: "g10"}
        {symbol: "USDCAD=X",  name: "US Dollar / Canadian Dollar",        type: "forex",     category: "g10"}
        {symbol: "USDCNY=X",  name: "US Dollar / Chinese Yuan",           type: "forex",     category: "em"}
        {symbol: "USDINR=X",  name: "US Dollar / Indian Rupee",           type: "forex",     category: "em"}
        {symbol: "USDBRL=X",  name: "US Dollar / Brazilian Real",         type: "forex",     category: "em"}
        {symbol: "GC=F",      name: "Gold Futures",                       type: "commodity", category: "metals"}
        {symbol: "SI=F",      name: "Silver Futures",                     type: "commodity", category: "metals"}
        {symbol: "CL=F",      name: "Crude Oil (WTI) Futures",            type: "commodity", category: "energy"}
        {symbol: "BZ=F",      name: "Brent Crude Oil Futures",            type: "commodity", category: "energy"}
        {symbol: "NG=F",      name: "Natural Gas Futures",                type: "commodity", category: "energy"}
        {symbol: "ZW=F",      name: "Wheat Futures",                      type: "commodity", category: "agriculture"}
        {symbol: "ZC=F",      name: "Corn Futures",                       type: "commodity", category: "agriculture"}
        {symbol: "ZS=F",      name: "Soybean Futures",                    type: "commodity", category: "agriculture"}
        {symbol: "KC=F",      name: "Coffee Futures",                     type: "commodity", category: "agriculture"}
        {symbol: "^GSPC",     name: "S&P 500",                            type: "index",     category: "us"}
        {symbol: "^DJI",      name: "Dow Jones Industrial",               type: "index",     category: "us"}
        {symbol: "^IXIC",     name: "NASDAQ Composite",                   type: "index",     category: "us"}
        {symbol: "^RUT",      name: "Russell 2000",                       type: "index",     category: "us"}
        {symbol: "^VIX",      name: "CBOE Volatility Index",              type: "index",     category: "us"}
        {symbol: "^TNX",      name: "10-Year Treasury Yield",             type: "index",     category: "us"}
        {symbol: "^FTSE",     name: "FTSE 100 (UK)",                      type: "index",     category: "international"}
        {symbol: "^GDAXI",    name: "DAX (Germany)",                      type: "index",     category: "international"}
        {symbol: "^N225",     name: "Nikkei 225 (Japan)",                 type: "index",     category: "international"}
        {symbol: "^HSI",      name: "Hang Seng (Hong Kong)",              type: "index",     category: "international"}
    ]

    mut rows = $all
    if ($type | is-not-empty)   { $rows = ($rows | where type == $type) }
    if ($search | is-not-empty) {
        let q = ($search | str downcase)
        $rows = ($rows | where {|r| ($r.name | str downcase | str contains $q) or ($r.symbol | str downcase | str contains $q) })
    }
    $rows
}

# Fetch options chain for a stock ticker via CBOE delayed quotes (~15min delay)
export def "prim-market-options" [
    --ticker: string = ""       # Stock ticker symbol (equities only)
    --expiry: string = ""       # ISO date filter e.g. 2026-05-16 (default: nearest with volume)
    --type:   string = "both"   # calls, puts, or both
    --limit:  string = "25"     # Max rows per type
]: nothing -> table {
    let sym  = ($ticker | str upcase)
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
