# Fetch N days of Crypto Fear & Greed Index history. Returns a table with value, label, timestamp. Default 30 days.
@category feargreed
export def "prim-fear-greed-history" [
    --days: string = "30" # Number of days of history to return
]: nothing -> table {
    const FG_UA = "Mozilla/5.0 (compatible; junction-box-feargreed/1.0)"
    let n   = ($days | into int)
    let raw = (http get -H {User-Agent: $FG_UA} $"https://api.alternative.me/fng/?limit=($n)")
    $raw.data | each {|d|
        {
            value:     ($d.value | into int)
            label:     $d.value_classification
            timestamp: ($d.timestamp | into int)
        }
    }
}
