use _shared.nu *
# Fetch EPS history from EDGAR plus forward estimates from Finviz: history table, eps_ttm, next quarter and multi-year growth rates.
@category sec
export def "prim-sec-earnings" [
    --ticker:   string = ""  # [wirable][required] Stock ticker symbol (e.g. AAPL)
    --quarters: string = "8" # Number of historical quarters to include
]: nothing -> record {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym    = ($ticker_val | str upcase)
    let cik    = (sec_ticker_to_cik $sym)
    let padded = (sec_pad_cik $cik)
    let n      = ($quarters | into int)

    let gaap = (
        http get -H {User-Agent: $EDGAR_UA}
            $"https://data.sec.gov/api/xbrl/companyfacts/CIK($padded).json"
        | get facts.us-gaap
    )

    let eps_concepts = ["EarningsPerShareBasic" "EarningsPerShareDiluted" "IncomeLossFromContinuingOperationsPerBasicShare"]
    let matched      = ($eps_concepts | where {|c| $c in ($gaap | columns)})
    let eps_concept  = if ($matched | is-empty) { null } else { $matched | first }

    let history = if $eps_concept == null { [] } else {
        ($gaap | get $eps_concept | get units | values | first)
        | where form == "10-Q"
        | sort-by end --reverse
        | uniq-by end
        | first $n
        | select end val
        | rename period_end eps_actual
        | insert concept $eps_concept
        | reverse
    }

    let html = (http get
        -H {User-Agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
        $"https://finviz.com/quote.ashx?t=($sym)")
    let cells = (
        $html
        | query web --query "table.snapshot-table2 td"
        | each {|c| $c | str join "" | str trim}
    )
    let s = ($cells | chunks 2 | reduce --fold {} {|pair, acc|
        $acc | upsert ($pair | get 0) ($pair | get 1)
    })
    let g = {|k| $s | get --optional $k}

    def to_fe []: string -> any {
        try { $in | str trim | str replace --regex '%$' '' | str replace --all ',' '' | into float } catch { null }
    }

    {
        ticker:    $sym
        history:   $history
        estimates: {
            eps_ttm:            (try { do $g "EPS (ttm)"   | to_fe } catch { null })
            eps_next_q:         (try { do $g "EPS next Q"  | to_fe } catch { null })
            eps_growth_this_y:  (try { do $g "EPS this Y"  | to_fe } catch { null })
            eps_growth_next_y:  (try { do $g "EPS next Y"  | to_fe } catch { null })
            eps_growth_past_5y: (try { do $g "EPS past 5Y" | to_fe } catch { null })
            eps_growth_next_5y: (try { do $g "EPS next 5Y" | to_fe } catch { null })
        }
    }
}
