# Fetch recent commit history for a public GitHub repository. Returns a table with sha, author, message, date.
@category github
export def "prim-github-commits" [
    --owner: string = "nus"     # [wirable] Repository owner
    --repo:  string = "nushell" # [wirable] Repository name
    --limit: string = "20"      # Max commits to return
]: nothing -> table {
    const GH_UA = "Mozilla/5.0 (compatible; junction-box-github/1.0)"
    let owner_val = if ($owner | str starts-with '"') { try { $owner | from json } catch { $owner } } else { $owner }
    let repo_val  = if ($repo  | str starts-with '"') { try { $repo  | from json } catch { $repo  } } else { $repo }
    let url = $"https://api.github.com/repos/($owner_val)/($repo_val)/commits?per_page=($limit | into int)"
    let raw = (http get -H {User-Agent: $GH_UA} -H {Accept: "application/vnd.github.v3+json"} $url)
    $raw | each {|c|
        let author_login = (try { $c.author.login } catch { "" })
        let commit_msg  = (try { $c.commit.message | split row "\n" | first } catch { "" })
        {
            sha:     (try { $c.sha     } catch { "" })
            author:  $author_login
            message: $commit_msg
            date:    (try { $c.commit.author.date } catch { "" })
        }
    }
}
