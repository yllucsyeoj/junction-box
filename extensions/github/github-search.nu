# Search GitHub repositories, code, issues, or users via the GitHub Search API. Returns a table with id, name, url, description, stars, language, owner, and topics per result. Set GITHUB_TOKEN env var for higher rate limits (5000/hr vs 60/hr).
@category github
export def "prim-github-search" [
    --query: string = ""          # [wirable][required] Search query (GitHub qualifiers supported: repo:, user:, language:, etc.)
    --type: string = "repositories" # Search type: repositories, code, issues, users, commits, topics
    --limit: string = "10"        # Max results (1–100)
    --language: string = ""       # [wirable] Filter by language (e.g. rust, typescript, python) — applies to repositories type only
    --sort_param: string = ""     # Sort field: stars, forks, updated, or empty for best match
    --order: string = "desc"      # Sort order: desc, asc
]: nothing -> table {
    let q = if ($query | str starts-with '"') { try { $query | from json } catch { $query } } else { $query }
    if ($q | is-empty) { error make {msg: "provide --query to search GitHub"} }

    let valid_types = ["repositories", "code", "issues", "users", "commits", "topics"]
    if ($type not-in $valid_types) {
        error make {msg: $"type must be one of: ($valid_types | str join ', ')"}
    }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 100] | math min)

    let full_query = if ($language | is-empty) { $q } else { $q + $"+language:($language)"}

    let query_params = {q: $full_query, per_page: ($clamped | into string)}
    let query_params = if ($sort_param | is-empty) { $query_params } else { $query_params | insert sort $sort_param | insert order $order }

    let url = ({
        scheme: "https",
        host: "api.github.com",
        path: $"/search/($type)",
        params: $query_params
    } | url join)

    let headers = {User-Agent: "junction-box-github/1.0", Accept: "application/vnd.github.v3+json"}
    let headers = if ("GITHUB_TOKEN" in $env and ($env.GITHUB_TOKEN | str length) > 0) {
        $headers | insert Authorization $"Bearer ($env.GITHUB_TOKEN)"
    } else { $headers }

    let resp = (http get -H $headers $url)
    let items = ($resp.items? | default [])
    if ($items | is-empty) { return [] }

    if ($type == "repositories") {
        $items | each {|r|
            {
                id:          ($r.id? | default 0 | into int)
                name:        ($r.full_name? | default ($r.name? | default ""))
                url:         ($r.html_url? | default "")
                description: ($r.description? | default "" | str substring 0..200)
                stars:       ($r.stargazers_count? | default 0)
                forks:       ($r.forks_count? | default 0)
                language:    ($r.language? | default "")
                topics:      ($r.topics? | default [] | str join ", ")
                owner:       ($r.owner? | default {} | get login? | default "")
                updatedAt:   ($r.updated_at? | default "")
            }
        }
    } else if ($type == "users") {
        $items | each {|u|
            {
                id:       ($u.id? | default 0 | into int)
                login:    ($u.login? | default "")
                url:      ($u.html_url? | default "")
                type:     ($u.type? | default "User")
                avatar:   ($u.avatar_url? | default "")
                score:    ($u.score? | default 0.0)
            }
        }
    } else if ($type == "issues") {
        $items | each {|i|
            {
                id:        ($i.id? | default 0 | into int)
                number:    ($i.number? | default 0)
                title:     ($i.title? | default "")
                state:     ($i.state? | default "")
                url:       ($i.html_url? | default "")
                repo:      ($i.repository_url? | default "" | str replace "https://api.github.com/repos/" "")
                user:      ($i.user? | default {} | get login? | default "")
                labels:    ($i.labels? | default [] | each {|l| $l.name? | default ""} | str join ", ")
                createdAt: ($i.created_at? | default "")
            }
        }
    } else if ($type == "code") {
        $items | each {|c|
            {
                name:       ($c.name? | default "")
                path:       ($c.path? | default "")
                repo:       ($c.repository? | default {} | get full_name? | default "")
                url:        ($c.html_url? | default "")
                language:   ($c.repository? | default {} | get language? | default "")
            }
        }
    } else {
        $items | each {|r|
            {
                id:   ($r.id? | default 0 | into int)
                name: ($r.name? | default ($r.full_name? | default ""))
                url:  ($r.html_url? | default "")
            }
        }
    }
}