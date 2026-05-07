export const RSS_UA = "Mozilla/5.0 (compatible; junction-box-rss/1.0)"

# Find the first child element with the given tag name in an XML content list
export def rss_find [tag: string]: list -> record {
    let found = ($in | where {|n| ($n | get tag? | default "") == $tag})
    if ($found | is-empty) { {tag: $tag, attributes: {}, content: []} } else { $found | first }
}

# Extract text content from a parsed XML element record
export def rss_text []: record -> string {
    let c = (try { $in.content | first } catch { return "" })
    if $c == null { return "" }
    let inner = (try { $c | get content } catch { return "" })
    if ($inner | describe) == "string" { $inner } else {
        try { $inner | first | get content | into string } catch { "" }
    }
}

# Read a named attribute from a parsed XML element record
export def rss_attr [attr: string]: record -> string {
    try { $in | get attributes | get $attr | into string } catch { "" }
}
