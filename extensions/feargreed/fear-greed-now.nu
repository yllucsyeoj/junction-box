# Fetch the current Crypto Fear & Greed Index. Returns a record with value (0-100), label (Extreme Fear / Fear / Neutral / Greed / Extreme Greed), and timestamp. Useful as a market regime gate — wire into a filter or if node.
@category feargreed
export def "prim-fear-greed-now" []: nothing -> record {
    const FG_UA = "Mozilla/5.0 (compatible; junction-box-feargreed/1.0)"
    let raw = (http get -H {User-Agent: $FG_UA} "https://api.alternative.me/fng/?limit=1")
    let d   = ($raw.data | first)
    {
        value:     ($d.value | into int)
        label:     $d.value_classification
        timestamp: ($d.timestamp | into int)
    }
}
