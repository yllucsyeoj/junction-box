use _shared.nu *
# Fetch insider transactions (Form 4) for a ticker: owner_name, role, transaction_date, code (string: S=sale, P=purchase, F=tax), shares, price_per_share, value, shares_after. Filter on code with: filter(column:code, op:==, value:S).
@category sec
export def "prim-sec-insider" [
    --ticker: string = ""   # [wirable][required] Stock ticker symbol (e.g. AAPL)
    --limit:  string = "20" # Number of Form 4 filings to parse
]: nothing -> table {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym     = ($ticker_val | str upcase)
    let cik     = (sec_ticker_to_cik $sym)
    let padded  = (sec_pad_cik $cik)
    let filings = (sec_get_filings $cik "4" | first ($limit | into int))

    if ($filings | is-empty) {
        error make {msg: $"No Form 4 filings found for ($sym)"}
    }

    $filings | each {|f|
        let clean   = ($f.accession | str replace --all "-" "")
        let idx_url = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($f.accession)-index.htm"
        let idx     = (http get -H {User-Agent: $EDGAR_UA} $idx_url)
        let xml_file = (try { sec_find_xml_file $idx } catch { null })
        if $xml_file == null { return [] }

        let xml_url = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($xml_file)"
        let doc     = (try { http get -H {User-Agent: $EDGAR_UA} $xml_url } catch { return [] })
        try { sec_parse_transactions $doc $f.date $sym } catch { [] }
    } | flatten
}
