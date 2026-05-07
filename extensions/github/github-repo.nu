# Fetch metadata for a public GitHub repository. Returns a record with name, full_name, description, language, stars, forks, watchers, open_issues, topics, created_at, pushed_at, url.
@category github
export def "prim-github-repo" [
    --owner: string = "nus"     # [wirable] Repository owner (user or org)
    --repo:  string = "nushell" # [wirable] Repository name
]: nothing -> record {
    const GH_UA = "Mozilla/5.0 (compatible; junction-box-github/1.0)"
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
