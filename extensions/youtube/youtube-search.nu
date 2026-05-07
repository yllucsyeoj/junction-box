use _shared.nu *
# Search YouTube for videos matching a query. Returns a table of results with video_id, title, channel, channel_id, published, description, views.
@category youtube
export def "prim-youtube-search" [
    --query: string = ""    # [wirable][required] Search terms
    --limit: string = "10"  # Max number of results to return
]: nothing -> table {
    let query_val = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($query_val | is-empty) {
        error make {msg: "provide --query with search terms"}
    }

    let encoded = ($query_val | url encode)
    let html    = (http get
        -H {User-Agent: $YT_UA}
        $"https://www.youtube.com/results?search_query=($encoded)")

    let data = ($html | yt_extract_page_json "var ytInitialData = ")

    let section = (try {
        $data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents
        | where {|c| "itemSectionRenderer" in ($c | columns)}
        | first
        | get itemSectionRenderer.contents
    } catch {
        error make {msg: "Could not parse search results — YouTube page structure may have changed"}
    })

    let videos = ($section | where {|item| "videoRenderer" in ($item | columns)})
    let n      = ($limit | into int)
    let take   = ([$n ($videos | length)] | math min)

    $videos | first $take | each {|item|
        let v = $item.videoRenderer
        {
            video_id:    (try { $v.videoId                                                                          } catch { "" })
            title:       (try { $v.title.runs | first | get text                                                    } catch { "" })
            channel:     (try { $v.ownerText.runs | first | get text                                                } catch { "" })
            channel_id:  (try { $v.ownerText.runs | first | get navigationEndpoint.browseEndpoint.browseId          } catch { "" })
            published:   (try { $v.publishedTimeText.simpleText                                                     } catch { "" })
            description: (try { $v.detailedMetadataSnippets | first | get snippetText.runs | each { get text } | str join " " } catch { "" })
            views:       (try { $v.viewCountText.simpleText                                                         } catch { "" })
        }
    }
}
