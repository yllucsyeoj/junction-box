use _shared.nu *
# Fetch the latest DEF 14A proxy statement for a ticker: executive compensation tables and shareholder proposal summaries.
@category sec
export def "prim-sec-proxy" [
    --ticker: string = "" # [wirable][required] Stock ticker symbol (e.g. AAPL)
]: nothing -> record {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let sym     = ($ticker_val | str upcase)
    let cik     = (sec_ticker_to_cik $sym)
    let filings = (sec_get_filings $cik "DEF 14A")

    if ($filings | is-empty) {
        error make {msg: $"No DEF 14A filings found for ($sym)"}
    }

    let latest = ($filings | first)
    let padded = (sec_pad_cik $cik)
    let clean  = ($latest.accession | str replace --all '-' '')
    let index_url  = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($latest.accession)-index.htm"
    let index_page = (http get -H {User-Agent: $EDGAR_UA} $index_url)

    let doc_link = (
        $index_page
        | query web --query "table.tableFile a"
        | each { get 0 }
        | where {|l| ($l | str ends-with ".htm") and not ($l | str ends-with "-index.htm")}
        | first
    )

    let doc_url = $"https://www.sec.gov/Archives/edgar/data/($padded)/($clean)/($doc_link)"
    let doc     = (http get -H {User-Agent: $EDGAR_UA} $doc_url)

    let comp_tables = (
        $doc | query web --query "table" | enumerate
        | each {|it|
            let text = ($it.item | str join " " | str replace --all --regex '\s+' ' ' | str trim)
            if ($text | str downcase | str contains "salary") and ($text | str downcase | str contains "bonus") {
                {table_index: $it.index, content: ($text | str substring 0..1500)}
            }
        }
        | compact | first 2
    )

    let proposals = (
        $doc | query web --query "p, h2, h3"
        | each {|s| $s | str join " " | str trim}
        | where {|s| ($s | str downcase | str contains "proposal") and ($s | str length) > 20}
        | first 8
    )

    {
        ticker:               $sym
        form:                 "DEF 14A"
        date:                 $latest.date
        accession:            $latest.accession
        doc_url:              $doc_url
        compensation_tables:  $comp_tables
        proposals:            $proposals
    }
}
