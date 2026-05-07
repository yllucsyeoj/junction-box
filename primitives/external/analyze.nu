# Send a table to an LLM for analysis. Formats rows as numbered items [1]..[N] so the model can cite sources by number. --fields selects which columns to include (comma-sep; default: all except noise cols). --prompt sets the task. Returns a string.
@category external
export def "prim-analyze" [
    --prompt:     string = "Summarize the key themes. For each theme cite the source items by number (e.g. [3], [7])."
    --fields:     string = ""      # Comma-separated columns to include (default: all except noise)
    --context:    string = "You are a concise analyst. Output only your final answer — no thinking, no self-correction, no preamble."  # System prompt
    --model:      string = ""      # Model ID — overrides LLM_MODEL env var when set
    --max_tokens: string = "2048"  # Max tokens to generate
]: table -> string {
    let tbl = $in

    # Noise columns added by source nodes that clutter LLM context
    let noise = ["permalink", "created_utc", "upvote_ratio", "objectID", "story_id"]

    # Determine which columns to use
    let all_cols = ($tbl | columns)
    let use_cols = if ($fields | is-empty) {
        $all_cols | where {|c| not ($noise | any {|n| $n == $c})}
    } else {
        $fields | split row "," | each {|c| $c | str trim} | where {|c| $c != ""}
    }

    # Format as numbered rows for citation
    let formatted = ($tbl | enumerate | each {|row|
        let n    = ($row.index + 1)
        let item = ($row.item)
        let parts = ($use_cols | each {|col|
            let v = (try { $item | get $col | into string } catch { "" })
            $"($col): ($v)"
        })
        $"[($n)] ($parts | str join '  ')"
    } | str join "\n")

    let user_msg = $"($prompt)\n\n($formatted)"

    # Resolve LLM config (same logic as prim-llm)
    let llm_endpoint = (try { $env.LLM_ENDPOINT } catch { "" })
    let use_anthropic = ($llm_endpoint | is-empty)
    let url = if $use_anthropic { "https://api.anthropic.com/v1/messages" } else { $llm_endpoint }
    let api_key = if $use_anthropic {
        try { $env.LLM_API_KEY } catch { try { $env.ANTHROPIC_API_KEY } catch { "" } }
    } else {
        try { $env.LLM_API_KEY } catch { "" }
    }
    let resolved_model = if ($model | is-empty) {
        try { $env.LLM_MODEL } catch { if $use_anthropic { "claude-haiku-4-5-20251001" } else { "" } }
    } else { $model }

    if $use_anthropic and ($api_key | is-empty) {
        error make {msg: "analyze: no API key — set LLM_API_KEY or ANTHROPIC_API_KEY"}
    }

    let max_tok = ($max_tokens | into int)

    if $use_anthropic {
        let body = if ($context | is-empty) {
            {model: $resolved_model, max_tokens: $max_tok, messages: [{role: "user", content: $user_msg}]}
        } else {
            {model: $resolved_model, max_tokens: $max_tok, system: $context, messages: [{role: "user", content: $user_msg}]}
        }
        let resp = (http post $url
            --headers {x-api-key: $api_key, anthropic-version: "2023-06-01", content-type: "application/json"}
            ($body | to json))
        $resp | get content.0.text
    } else {
        let messages = if ($context | is-empty) {
            [{role: "user", content: $user_msg}]
        } else {
            [{role: "system", content: $context}, {role: "user", content: $user_msg}]
        }
        let body = {model: $resolved_model, max_tokens: $max_tok, messages: $messages}
        let headers = if ($api_key | is-empty) {
            {content-type: "application/json"}
        } else {
            {Authorization: $"Bearer ($api_key)", content-type: "application/json"}
        }
        let resp = (http post $url --headers $headers ($body | to json))
        let msg = ($resp | get choices.0.message)
        let content = (try { $msg | get content | default "" } catch { "" })
        if ($content | is-empty) {
            try { $msg | get reasoning_content | default "" } catch { "" }
        } else {
            $content
        }
    }
}
