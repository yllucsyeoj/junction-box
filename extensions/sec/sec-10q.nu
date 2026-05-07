use _shared.nu *
# Fetch quarterly (10-Q) financial data for a ticker via EDGAR XBRL: revenue, net income, operating income, EPS.
@category sec
export def "prim-sec-10q" [
    --ticker:   string = ""  # [wirable][required] Stock ticker symbol (e.g. AAPL)
    --quarters: string = "4" # Number of quarters to return
]: nothing -> record {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let cik    = (sec_ticker_to_cik $ticker_val)
    let padded = (sec_pad_cik $cik)
    let latest = (sec_get_filings $cik "10-Q" | first)
    let gaap   = (
        http get -H {User-Agent: $EDGAR_UA}
            $"https://data.sec.gov/api/xbrl/companyfacts/CIK($padded).json"
        | get facts.us-gaap
    )
    let n = ($quarters | into int)
    {
        ticker:     ($ticker_val | str upcase)
        form:       "10-Q"
        date:       $latest.date
        accession:  $latest.accession
        financials: {
            revenue:          (sec_fetch_fallback $gaap ["RevenueFromContractWithCustomerExcludingAssessedTax" "Revenues" "SalesRevenueNet"] $n "10-Q")
            net_income:       (sec_fetch_fallback $gaap ["NetIncomeLoss" "ProfitLoss"] $n "10-Q")
            operating_income: (sec_fetch_fallback $gaap ["OperatingIncomeLoss"] $n "10-Q")
            eps_basic:        (sec_fetch_fallback $gaap ["EarningsPerShareBasic" "IncomeLossFromContinuingOperationsPerBasicShare"] $n "10-Q")
        }
    }
}
