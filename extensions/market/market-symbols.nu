# Look up known non-equity symbols (crypto, forex, commodities, indices). Filter by --type or --search.
@category market
export def "prim-market-symbols" [
    --type:   string = "" # [options:crypto,forex,commodity,index] Filter by asset type
    --search: string = "" # Case-insensitive search on name or symbol
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
