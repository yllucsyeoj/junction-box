export const EDGAR_UA = "research-tool admin@example.com"

export def sec_ticker_to_cik [ticker: string]: nothing -> string {
    let data  = (http get -H {User-Agent: $EDGAR_UA} "https://www.sec.gov/files/company_tickers.json")
    let upper = ($ticker | str upcase)
    $data | values | where ticker == $upper | first | get cik_str | into string
}

export def sec_pad_cik [cik: string]: nothing -> string {
    $cik | fill -a right -c '0' -w 10
}

export def sec_get_filings [cik: string, form: string]: nothing -> table {
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

export def sec_fetch_fallback [gaap: record, concepts: list<string>, n: int, form: string]: nothing -> list {
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

export def sec_extract_text [html: string]: nothing -> string {
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

export def sec_find_best_doc [index_html: string]: nothing -> record {
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

export def sec_xval []: record -> any {
    let c1 = (try { $in.content | first } catch { return null })
    if ($c1 == null) { return null }
    let inner = ($c1 | get content)
    if ($inner | describe) == "string" { $inner } else {
        try { $inner | first | get content } catch { null }
    }
}

export def sec_xchild [tag: string]: list -> record {
    let n = ($in | where tag == $tag)
    if ($n | is-empty) { {tag: $tag, attributes: {}, content: []} } else { $n | first }
}

export def sec_find_xml_file [html: string]: nothing -> string {
    $html
    | query web --query "table.tableFile tr td a"
    | each {|c| $c | str join "" | str trim}
    | where {$in | str ends-with ".xml"}
    | where {|s| not ($s | str starts-with "0")}
    | first
}

export def sec_parse_transactions [doc: record, filing_date: string, ticker: string]: nothing -> list {
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

    $ndt.content | where {|n| ($n | describe) =~ "record"} | each {|txn|
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
