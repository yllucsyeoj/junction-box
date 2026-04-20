# GoNude Fear & Greed extension
# Nodes: now, history
# Source: alternative.me/fng — no auth required

export const FEARGREED_PRIMITIVE_META = {
    fear_greed_now: {
        category: "feargreed"
        color: "#ef4444"
        wirable: []
        agent_hint: "Fetch the current Crypto Fear & Greed Index. Returns a record with value (0-100), label (Extreme Fear / Fear / Neutral / Greed / Extreme Greed), and timestamp. Useful as a market regime gate — wire into a filter or if node."
        param_options: {}
    }
    fear_greed_history: {
        category: "feargreed"
        color: "#ef4444"
        wirable: []
        agent_hint: "Fetch N days of Crypto Fear & Greed Index history. Returns a table with value, label, timestamp. Default 30 days."
        param_options: {}
    }
}

const FG_UA = "Mozilla/5.0 (compatible; gonude-feargreed/1.0)"

# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch the current Fear & Greed Index value
export def "prim-fear-greed-now" []: nothing -> record {
    let raw = (http get -H {User-Agent: $FG_UA} "https://api.alternative.me/fng/?limit=1")
    let d   = ($raw.data | first)
    {
        value:     ($d.value | into int)
        label:     $d.value_classification
        timestamp: ($d.timestamp | into int)
    }
}

# Fetch N days of Fear & Greed Index history
export def "prim-fear-greed-history" [
    --days: string = "30" # Number of days of history to return
]: nothing -> table {
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
