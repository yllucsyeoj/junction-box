# Look up word definitions from the Free Dictionary API. Returns a table with word, partOfSpeech, definition, example.
@category reference
export def "prim-dictionary" [
    --word: string = ""    # [wirable][required] Word to look up
]: nothing -> table {
    let w = if ($word | str starts-with '"') { try { $word | from json } catch { $word } } else { $word }
    if ($w | is-empty) { error make {msg: "provide --word to look up"} }
    let url = ({
        scheme: "https",
        host: "api.dictionaryapi.dev",
        path: $"/api/v2/entries/en/($w)"
    } | url join)
    let resp = (http get -H {User-Agent: "junction-box/1.0"} $url)
    let resp_type = ($resp | describe)
    if ($resp_type | str starts-with "record") {
        [[word partOfSpeech definition example]; [$w ($resp.title) ($resp.message) ""]]
    } else {
        $resp | each {|entry|
            $entry.meanings | each {|m|
                $m.definitions | each {|d|
                    {word: $entry.word, partOfSpeech: $m.partOfSpeech, definition: $d.definition, example: (try { $d.example } catch { "" })}
                }
            }
        } | flatten | flatten
    }
}