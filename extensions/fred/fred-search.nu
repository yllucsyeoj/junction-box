# Search FRED series by keyword. Returns a table with series_id, title, start_date, end_date, frequency, units. Use to discover series IDs for fred_series node.
@category fred
export def "prim-fred-search" [
    --query: string = "gdp" # [wirable] Search keyword
    --limit: string = "20"  # Max results
]: nothing -> table {
    const FRED_UA = "Mozilla/5.0 (compatible; junction-box-fred/1.0)"
    let key = (try { $env.FRED_API_KEY } catch { "" })
    if ($key | is-empty) {
        error make {msg: "FRED_API_KEY not set in .env — get a free key at fred.stlouisfed.org/docs/api/api_key.html"}
    }
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    let q = ($query_val | url encode)
    let url = $"https://api.stlouisfed.org/fred/series/search?search_text=($q)&api_key=($key)&file_type=json&limit=($limit | into int)"
    let raw = (http get -H {User-Agent: $FRED_UA} $url)
    let results = (try { $raw.seriess } catch { [] })
    $results | each {|s|
        {
            series_id:  (try { $s.id   } catch { "" })
            title:      (try { $s.title } catch { "" })
            start_date: (try { $s.start } catch { "" })
            end_date:   (try { $s.end   } catch { "" })
            frequency:  (try { $s.frequency } catch { "" })
            units:      (try { $s.units } catch { "" })
        }
    }
}
