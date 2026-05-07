export const FINVIZ_URL = "https://finviz.com/quote.ashx?t="
export const FINVIZ_UA  = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export def mkt_parse_stats [html: string]: nothing -> record {
    let cells = (
        $html
        | query web --query "table.snapshot-table2 td"
        | each {|c| $c | str join "" | str trim}
    )
    $cells | chunks 2 | reduce --fold {} {|pair, acc|
        $acc | upsert ($pair | get 0) ($pair | get 1)
    }
}

export def mkt_to_f []: string -> float {
    $in | str trim | str replace --all ',' '' | str replace --regex '%$' '' | into float
}

export def mkt_to_magnitude []: string -> float {
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

export def mkt_pct_f []: string -> float {
    $in | str trim | str replace --regex '%$' '' | into float
}

export def mkt_first_num_f []: string -> float {
    $in | split row ' ' | first | str trim | into float
}

export def mkt_paren_pct_f []: string -> float {
    let m = ($in | parse --regex '\(([0-9.]+)%\)')
    if ($m | is-empty) { 0.0 } else { $m | first | get capture0 | into float }
}

export def mkt_parse_option_symbol [sym: string, ticker: string]: nothing -> record {
    let tl     = ($ticker | str length)
    let ds     = ($sym | str substring $tl..($tl + 5))
    let typ    = ($sym | str substring ($tl + 6)..($tl + 6))
    let sk     = ($sym | str substring ($tl + 7)..)
    let expiry = $"20($ds | str substring 0..1)-($ds | str substring 2..3)-($ds | str substring 4..5)"
    let strike = (($sk | into int) / 1000)
    {expiry: $expiry, type: (if $typ == "C" { "call" } else { "put" }), strike: $strike}
}
