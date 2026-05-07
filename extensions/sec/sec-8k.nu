use _shared.nu *
# List recent 8-K material event filings for a ticker. Returns date, accession number, and reported items.
@category sec
export def "prim-sec-8k" [
    --ticker: string = ""   # [wirable][required] Stock ticker symbol (e.g. AAPL)
    --limit:  string = "10" # Number of filings to return
]: nothing -> table {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym    = ($ticker_val | str upcase)
    let cik    = (sec_ticker_to_cik $sym)
    let padded = (sec_pad_cik $cik)
    let filings = (sec_get_filings $cik "8-K" | first ($limit | into int))

    if ($filings | is-empty) {
        error make {msg: $"No 8-K filings found for ($sym)"}
    }

    $filings | each {|f|
        let clean     = ($f.accession | str replace --all '-' '')
        let index_url = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($f.accession)-index.htm"
        let page      = (http get -H {User-Agent: $EDGAR_UA} $index_url)
        let groups    = ($page | query web --query "div.formGrouping")
        let items     = (
            if ($groups | length) >= 3 {
                $groups | get 2 | skip 3
                | where {|s| ($s | str trim | str length) > 0}
                | str trim | str join " | "
            } else { "" }
        )
        {ticker: $sym, form: "8-K", date: $f.date, accession: $f.accession, items: $items}
    }
}
