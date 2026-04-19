# GoNude SEC / EDGAR data extension
# Nodes: 10-K, 10-Q, 8-K, earnings, insider, filing, proxy
# All data sourced from SEC EDGAR public APIs — no API key required.

export const SEC_PRIMITIVE_META = {
    sec_10k: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "Fetch annual (10-K) financial data for a ticker via EDGAR XBRL: revenue, net income, assets, liabilities, operating income, EPS."
        param_options: {}
    }
    sec_10q: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "Fetch quarterly (10-Q) financial data for a ticker via EDGAR XBRL: revenue, net income, operating income, EPS."
        param_options: {}
    }
    sec_8k: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "List recent 8-K material event filings for a ticker. Returns date, accession number, and reported items."
        param_options: {}
    }
    sec_earnings: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "Fetch EPS history from EDGAR plus forward estimates from Finviz: history table, eps_ttm, next quarter and multi-year growth rates."
        param_options: {}
    }
    sec_insider: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "Fetch insider transactions (Form 4) for a ticker: owner_name, role, transaction_date, code (string: S=sale, P=purchase, F=tax), shares, price_per_share, value, shares_after. Filter on code with: filter(column:code, op:==, value:S)."
        param_options: {}
    }
    sec_filing: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "Fetch the text content of any SEC filing by ticker and accession number. Returns the first 3000 chars of the primary document."
        param_options: {}
    }
    sec_proxy: {
        category: "sec"
        color: "#6366f1"
        wirable: []
        agent_hint: "Fetch the latest DEF 14A proxy statement for a ticker: executive compensation tables and shareholder proposal summaries."
        param_options: {}
    }
}

# ── EDGAR shared helpers ──────────────────────────────────────────────────────

const EDGAR_UA = "research-tool admin@example.com"

def sec_ticker_to_cik [ticker: string]: nothing -> string {
    let data  = (http get -H {User-Agent: $EDGAR_UA} "https://www.sec.gov/files/company_tickers.json")
    let upper = ($ticker | str upcase)
    $data | values | where ticker == $upper | first | get cik_str | into string
}

def sec_pad_cik [cik: string]: nothing -> string {
    $cik | fill -a right -c '0' -w 10
}

def sec_get_filings [cik: string, form: string]: nothing -> table {
    let padded = (sec_pad_cik $cik)
    let recent = (
        http get -H {User-Agent: $EDGAR_UA}
            $"https://data.sec.gov/submissions/CIK($padded).json"
        | get filings.recent
    )
    $recent.form | enumerate | each {|it|
        {
            form:      $it.item
            date:      ($recent.filingDate     | get $it.index)
            accession: ($recent.accessionNumber | get $it.index)
        }
    } | where form == $form
}

def sec_fetch_fallback [gaap: record, concepts: list<string>, n: int, form: string]: nothing -> list {
    let matches = ($concepts | where {|c| $c in ($gaap | columns)})
    if ($matches | is-empty) { return [] }
    let found = ($matches | first)
    ($gaap | get $found | get units | values | first)
    | where form == $form
    | sort-by end --reverse
    | uniq-by end
    | first $n
    | select end val
    | rename period_end value
    | insert concept $found
}

def sec_extract_text [html: string]: nothing -> string {
    let clean = (
        if ($html | str contains "<html") {
            $html | str replace --regex '(?s)^.*?(<html)' '<html'
        } else { $html }
    )
    $clean
    | query web --query "p, div, font, td"
    | each {|s| if ($s | describe) =~ "list" { $s | flatten | str join " " } else { $s | into string }}
    | each { str trim }
    | where {|s| ($s | str length) > 40 }
    | each { str replace --all --regex '\s+' ' ' }
    | uniq
    | str join "\n\n"
}

def sec_find_best_doc [index_html: string]: nothing -> record {
    let links = (
        $index_html
        | query web --query "table.tableFile tr"
        | skip 1
        | each {|row|
            let cells = ($row | where {|s| ($s | str trim | str length) > 0})
            if ($cells | length) >= 3 {
                {type: ($cells | get 1 | default ""), file: ($cells | get 2 | default "")}
            }
        }
        | compact
        | where {|r| ($r.file | str ends-with ".htm") or ($r.file | str ends-with ".html")}
    )
    let ex99 = ($links | where {|r| ($r.type | str downcase | str contains "99.1") or ($r.file | str downcase | str contains "ex99") })
    if not ($ex99 | is-empty) {
        {file: ($ex99 | first | get file), is_exhibit: true}
    } else {
        let primary = ($links | where {|r| not ($r.file | str ends-with "-index.htm")})
        if not ($primary | is-empty) { {file: ($primary | first | get file), is_exhibit: false} } else { null }
    }
}

# Form 4 XML helpers
def sec_xval []: record -> any {
    let c1 = (try { $in.content | first } catch { return null })
    if ($c1 == null) { return null }
    let inner = ($c1 | get content)
    if ($inner | describe) == "string" { $inner } else {
        try { $inner | first | get content } catch { null }
    }
}

def sec_xchild [tag: string]: list -> record {
    let n = ($in | where tag == $tag)
    if ($n | is-empty) { {tag: $tag, attributes: {}, content: []} } else { $n | first }
}

def sec_find_xml_file [html: string]: nothing -> string {
    $html
    | query web --query "table.tableFile tr td a"
    | each {|c| $c | str join "" | str trim}
    | where {$in | str ends-with ".xml"}
    | where {|s| not ($s | str starts-with "0")}
    | first
}

def sec_parse_transactions [doc: record, filing_date: string, ticker: string]: nothing -> list {
    let nodes      = $doc.content
    let owner_node = ($nodes | sec_xchild "reportingOwner")
    let id_node    = ($owner_node.content | sec_xchild "reportingOwnerId")
    let rel_node   = ($owner_node.content | sec_xchild "reportingOwnerRelationship")

    let owner_name  = ($id_node.content  | sec_xchild "rptOwnerName"  | sec_xval)
    let is_director = ($rel_node.content | sec_xchild "isDirector"    | sec_xval)
    let title       = ($rel_node.content | sec_xchild "officerTitle"  | sec_xval)
    let role        = if $title != null { $title } else if $is_director == "1" { "Director" } else { "Other" }

    let ndt = ($nodes | sec_xchild "nonDerivativeTable")
    if ($ndt.content | is-empty) { return [] }

    $ndt.content | each {|txn|
        let tc  = ($txn.content | sec_xchild "transactionCoding")
        let ta  = ($txn.content | sec_xchild "transactionAmounts")
        let pt  = ($txn.content | sec_xchild "postTransactionAmounts")
        let own = ($txn.content | sec_xchild "ownershipNature")

        let txn_date = ($txn.content | sec_xchild "transactionDate"                   | sec_xval)
        let code     = ($tc.content  | sec_xchild "transactionCode"                   | sec_xval)
        let shares_s = ($ta.content  | sec_xchild "transactionShares"                 | sec_xval)
        let price_s  = ($ta.content  | sec_xchild "transactionPricePerShare"          | sec_xval)
        let after_s  = ($pt.content  | sec_xchild "sharesOwnedFollowingTransaction"   | sec_xval)
        let di       = ($own.content | sec_xchild "directOrIndirectOwnership"         | sec_xval)

        let shares = (try { $shares_s | into float | into int } catch { null })
        let price  = (try { $price_s  | into float            } catch { null })
        let after  = (try { $after_s  | into float | into int } catch { null })
        let value  = (if $shares != null and $price != null { $shares * $price } else { null })

        {
            ticker:           ($ticker | str upcase)
            filing_date:      $filing_date
            owner_name:       $owner_name
            role:             $role
            transaction_date: $txn_date
            code:             ($code | into string | default "")
            shares:           $shares
            price_per_share:  $price
            value:            $value
            shares_after:     $after
            ownership:        (if $di == "D" { "direct" } else if $di == "I" { "indirect" } else { $di })
        }
    }
}

# ── Primitives ────────────────────────────────────────────────────────────────

# Fetch annual (10-K) financial data for a ticker via EDGAR XBRL
export def "prim-sec-10k" [
    --ticker: string = ""       # Stock ticker symbol (e.g. AAPL)
    --years:  string = "4"      # Number of annual filings to return
]: nothing -> record {
    let cik    = (sec_ticker_to_cik $ticker)
    let padded = (sec_pad_cik $cik)
    let latest = (sec_get_filings $cik "10-K" | first)
    let gaap   = (
        http get -H {User-Agent: $EDGAR_UA}
            $"https://data.sec.gov/api/xbrl/companyfacts/CIK($padded).json"
        | get facts.us-gaap
    )
    let n = ($years | into int)
    {
        ticker:     ($ticker | str upcase)
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

# Fetch quarterly (10-Q) financial data for a ticker via EDGAR XBRL
export def "prim-sec-10q" [
    --ticker:   string = ""     # Stock ticker symbol (e.g. AAPL)
    --quarters: string = "4"    # Number of quarters to return
]: nothing -> record {
    let cik    = (sec_ticker_to_cik $ticker)
    let padded = (sec_pad_cik $cik)
    let latest = (sec_get_filings $cik "10-Q" | first)
    let gaap   = (
        http get -H {User-Agent: $EDGAR_UA}
            $"https://data.sec.gov/api/xbrl/companyfacts/CIK($padded).json"
        | get facts.us-gaap
    )
    let n = ($quarters | into int)
    {
        ticker:     ($ticker | str upcase)
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

# List recent 8-K material event filings for a ticker
export def "prim-sec-8k" [
    --ticker: string = ""       # Stock ticker symbol (e.g. AAPL)
    --limit:  string = "10"     # Number of filings to return
]: nothing -> table {
    let sym    = ($ticker | str upcase)
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

# Fetch EPS history and forward estimates for a ticker
export def "prim-sec-earnings" [
    --ticker:   string = ""     # Stock ticker symbol (e.g. AAPL)
    --quarters: string = "8"    # Number of historical quarters to include
]: nothing -> record {
    let sym    = ($ticker | str upcase)
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

# Fetch insider transactions (Form 4) for a ticker
export def "prim-sec-insider" [
    --ticker: string = ""       # Stock ticker symbol (e.g. AAPL)
    --limit:  string = "20"     # Number of Form 4 filings to parse
]: nothing -> table {
    let sym     = ($ticker | str upcase)
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
        sec_parse_transactions $doc $f.date $sym
    } | flatten
}

# Fetch the text of any SEC filing by ticker and accession number
export def "prim-sec-filing" [
    --ticker:    string = ""    # Stock ticker symbol (e.g. AAPL)
    --accession: string = ""    # Accession number (e.g. 0001628280-26-022956)
]: nothing -> record {
    let sym    = ($ticker | str upcase)
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

# Fetch the latest DEF 14A proxy statement for a ticker
export def "prim-sec-proxy" [
    --ticker: string = ""       # Stock ticker symbol (e.g. AAPL)
]: nothing -> record {
    let sym     = ($ticker | str upcase)
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
