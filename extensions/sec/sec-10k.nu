use _shared.nu *
# Fetch annual (10-K) financial data for a ticker via EDGAR XBRL: revenue, net income, assets, liabilities, operating income, EPS.
@category sec
export def "prim-sec-10k" [
    --ticker: string = ""  # [wirable][required] Stock ticker symbol (e.g. AAPL)
    --years:  string = "4" # Number of annual filings to return
]: nothing -> record {
    let ticker_val = if ($ticker | str starts-with '"') { try { $ticker | from json } catch { $ticker } } else { $ticker }
    let cik    = (sec_ticker_to_cik $ticker_val)
    let padded = (sec_pad_cik $cik)
    let latest = (sec_get_filings $cik "10-K" | first)
    let gaap   = (
        http get -H {User-Agent: $EDGAR_UA}
            $"https://data.sec.gov/api/xbrl/companyfacts/CIK($padded).json"
        | get facts.us-gaap
    )
    let n = ($years | into int)
    {
        ticker:     ($ticker_val | str upcase)
        form:       "10-K"
        date:       $latest.date
        accession:  $latest.accession
        financials: {
            revenue:          (sec_fetch_fallback $gaap ["RevenueFromContractWithCustomerExcludingAssessedTax" "Revenues" "SalesRevenueNet" "RevenueFromContractWithCustomerIncludingAssessedTax"] $n "10-K")
            net_income:       (sec_fetch_fallback $gaap ["NetIncomeLoss" "ProfitLoss" "NetIncomeLossAvailableToCommonStockholdersBasic"] $n "10-K")
            assets:           (sec_fetch_fallback $gaap ["Assets"] $n "10-K")
            liabilities:      (sec_fetch_fallback $gaap ["Liabilities"] $n "10-K")
            operating_income: (sec_fetch_fallback $gaap ["OperatingIncomeLoss" "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"] $n "10-K")
            eps_basic:        (sec_fetch_fallback $gaap ["EarningsPerShareBasic" "IncomeLossFromContinuingOperationsPerBasicShare"] $n "10-K")
        }
    }
}
