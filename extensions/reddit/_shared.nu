export const REDDIT_UA   = "Mozilla/5.0 (compatible; junction-box-reddit/1.0)"
export const REDDIT_BASE = "https://old.reddit.com"

# Decode common HTML entities used in Reddit titles and text
export def reddit_decode []: string -> string {
    $in
    | str replace --all "&amp;"  "&"
    | str replace --all "&lt;"   "<"
    | str replace --all "&gt;"   ">"
    | str replace --all "&#39;"  "'"
    | str replace --all "&quot;" '"'
    | str replace --all "&#34;"  '"'
}

# Map a raw Reddit post data record to a clean output row
export def reddit_post_row []: record -> record {
    let d = $in
    {
        id:           (try { $d.id                                           } catch { "" })
        title:        (try { $d.title | reddit_decode                        } catch { "" })
        author:       (try { $d.author                                       } catch { "" })
        score:        (try { $d.score                                        } catch { 0 })
        upvote_ratio: (try { $d.upvote_ratio                                 } catch { 0.0 })
        num_comments: (try { $d.num_comments                                 } catch { 0 })
        url:          (try { $d.url                                          } catch { "" })
        permalink:    (try { $"($REDDIT_BASE)($d.permalink)"                 } catch { "" })
        selftext:     (try { $d.selftext                                     } catch { "" })
        created_utc:  (try { $d.created_utc                                  } catch { 0 })
        flair:        (try { $d.link_flair_text | default ""                 } catch { "" })
    }
}
