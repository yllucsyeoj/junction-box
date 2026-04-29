# GoNude GitHub extension
# Nodes: repo, contributors, commits
# Source: api.github.com — public, unauthenticated (60 req/hr)

export const GITHUB_PRIMITIVE_META = {
    github_repo: {
        category: "github"
        color: "#24292f"
        wirable: ["owner", "repo"]
        required_params: ["owner", "repo"]
        agent_hint: "Fetch metadata for a public GitHub repository. Returns a record with name, full_name, description, language, stars, forks, watchers, open_issues, topics, created_at, pushed_at, url."
        param_options: {}
    }
    github_contributors: {
        category: "github"
        color: "#24292f"
        wirable: ["owner", "repo"]
        required_params: ["owner", "repo"]
        agent_hint: "Fetch top contributors for a public GitHub repository. Returns a table with login, contributions, avatar_url. Note: repos with 10k+ commits return 0 contributions without auth."
        param_options: {}
    }
    github_commits: {
        category: "github"
        color: "#24292f"
        wirable: ["owner", "repo"]
        required_params: ["owner", "repo"]
        agent_hint: "Fetch recent commit history for a public GitHub repository. Returns a table with sha, author, message, date."
        param_options: {}
    }
}

const GH_UA = "Mozilla/5.0 (compatible; junction-box-github/1.0)"

# ── Primitives ───────────────────────────────────────────────────────────────

# Fetch GitHub repo metadata
export def "prim-github-repo" [
    --owner: string = "nus"   # Repository owner (user or org)
    --repo:  string = "nushell" # Repository name
]: nothing -> record {
    let owner_val = if ($owner | str starts-with '"') { try { $owner | from json } catch { $owner } } else { $owner }
    let repo_val  = if ($repo  | str starts-with '"') { try { $repo  | from json } catch { $repo  } } else { $repo }
    let url = $"https://api.github.com/repos/($owner_val)/($repo_val)"
    let raw = (http get -H {User-Agent: $GH_UA} -H {Accept: "application/vnd.github.v3+json"} $url)
    {
        name:            (try { $raw.name            } catch { "" })
        full_name:       (try { $raw.full_name       } catch { "" })
        description:     (try { $raw.description     } catch { "" })
        language:        (try { $raw.language        } catch { "" })
        stars:           (try { $raw.stargazers_count } catch { 0 })
        forks:           (try { $raw.forks_count      } catch { 0 })
        watchers:        (try { $raw.watchers_count   } catch { 0 })
        open_issues:     (try { $raw.open_issues_count } catch { 0 })
        topics:          (try { $raw.topics           } catch { [] })
        created_at:      (try { $raw.created_at      } catch { "" })
        pushed_at:       (try { $raw.pushed_at       } catch { "" })
        url:             (try { $raw.html_url        } catch { "" })
    }
}

# Fetch top contributors for a GitHub repo
export def "prim-github-contributors" [
    --owner:   string = "nus"   # Repository owner
    --repo:    string = "nushell" # Repository name
    --limit:   string = "10"     # Max contributors to return
]: nothing -> table {
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

# Fetch recent commits for a GitHub repo
export def "prim-github-commits" [
    --owner: string = "nus"   # Repository owner
    --repo:  string = "nushell" # Repository name
    --limit: string = "20"    # Max commits to return
]: nothing -> table {
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