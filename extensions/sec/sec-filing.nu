use _shared.nu *
# Fetch the text content of any SEC filing by ticker and accession number. Returns the first 3000 chars of the primary document.
@category sec
export def "prim-sec-filing" [
    --ticker:    string = "" # [wirable][required] Stock ticker symbol (e.g. AAPL)
    --accession: string = "" # Accession number (e.g. 0001628280-26-022956)
]: nothing -> record {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym    = ($ticker_val | str upcase)
    let cik    = (sec_ticker_to_cik $sym)
    let padded = (sec_pad_cik $cik)
    let clean  = ($accession | str replace --all '-' '')
    let index_url = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($accession)-index.htm"
    let index_html = (http get -H {User-Agent: $EDGAR_UA} $index_url)

    let groups      = ($index_html | query web --query "div.formGrouping")
    let form        = (if not ($groups | is-empty) { $groups | first | where {|s| ($s | str trim | str length) > 0} | get 1? | default "" | str trim } else { "" })
    let filing_date = (if ($groups | length) >= 2 { let g = ($groups | get 1 | where {|s| ($s | str trim | str length) > 0}); if ($g | is-empty) { "" } else { $g | last | str trim } } else { "" })

    let best = (sec_find_best_doc $index_html)
    if ($best == null) { error make {msg: $"No readable document found for ($accession)"} }

    let doc_url  = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($best.file)"
    let doc_html = (http get -H {User-Agent: $EDGAR_UA} $doc_url)
    let text     = (sec_extract_text $doc_html)

    {
        ticker:     $sym
        accession:  $accession
        form:       $form
        date:       $filing_date
        doc_file:   $best.file
        doc_type:   (if $best.is_exhibit { "exhibit_99_1" } else { "primary" })
        word_count: ($text | split words | length)
        content:    ($text | str substring 0..3000)
    }
}
