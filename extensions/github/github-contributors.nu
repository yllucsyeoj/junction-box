# Fetch top contributors for a public GitHub repository. Returns a table with login, contributions, avatar_url. Note: repos with 10k+ commits return 0 contributions without auth.
@category github
export def "prim-github-contributors" [
    --owner:   string = "nus"     # [wirable] Repository owner
    --repo:    string = "nushell" # [wirable] Repository name
    --limit:   string = "10"      # Max contributors to return
]: nothing -> table {
    const GH_UA = "Mozilla/5.0 (compatible; junction-box-github/1.0)"
    let owner_val = if ($owner | str starts-with '"') { try { $owner | from json } catch { $owner } } else { $owner }
    let repo_val  = if ($repo  | str starts-with '"') { try { $repo  | from json } catch { $repo  } } else { $repo }
    let url  = $"https://api.github.com/repos/($owner_val)/($repo_val)/contributors?per_page=($limit | into int)"
    let raw  = (http get -H {User-Agent: $GH_UA} -H {Accept: "application/vnd.github.v3+json"} $url)
    $raw | each {|c|
        {
            login:        (try { $c.login        } catch { "" })
            contributions: (try { $c.contributions } catch { 0 })
            avatar_url:  (try { $c.avatar_url   } catch { "" })
        }
    }
}
