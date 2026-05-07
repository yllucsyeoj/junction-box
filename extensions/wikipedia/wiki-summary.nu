use _shared.nu *
# Fetch the intro summary of a Wikipedia article. Returns a record with title, description (one-liner), extract (2-5 sentence summary). Wire title from wiki_search output for dynamic lookup.
@category wikipedia
export def "prim-wiki-summary" [
    --title: string = ""  # [wirable] Wikipedia article title (e.g. "Nvidia")
]: nothing -> record {
    let title_val = if ($title | str starts-with '"') { try { $title | from json } catch { $title } } else { $title }
    if ($title_val | is-empty) {
        error make {msg: "provide --title as the Wikipedia article title"}
    }
    let t   = ($title_val | url encode)
    let url = $"($WIKI_REST)/page/summary/($t)"
    let doc = (http get -H {User-Agent: $WIKI_UA} $url)
    {
        title:       (try { $doc.title       } catch { "" })
        description: (try { $doc.description } catch { "" })
        extract:     (try { $doc.extract     } catch { "" })
    }
}
