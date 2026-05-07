export const HN_UA = "Mozilla/5.0 (compatible; junction-box-hn/1.0)"

# Decode HTML entities common in Algolia HN comment text
export def hn_decode []: string -> string {
    $in
    | str replace --all "&amp;"   "&"
    | str replace --all "&lt;"    "<"
    | str replace --all "&gt;"    ">"
    | str replace --all "&#x2F;"  "/"
    | str replace --all "&#x27;"  "'"
    | str replace --all "&#39;"   "'"
    | str replace --all "&quot;"  '"'
    | str replace --all "&#34;"   '"'
    | str replace --all "<p>"     "\n"
}
