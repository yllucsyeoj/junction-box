use _shared.nu *
# Fetch key stats for a stock ticker from Finviz: price, P/E, market cap, margins, analyst target, etc.
@category market
export def "prim-market-snapshot" [
    --ticker: string = ""  # [wirable][required] Stock ticker symbol (e.g. AAPL, MSFT)
]: nothing -> record {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym  = ($ticker_val | str upcase)
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
