# Call an LLM. Config via server env: LLM_ENDPOINT (empty=Anthropic cloud, set for OpenAI-compatible/local), LLM_API_KEY, LLM_MODEL (default model ID — node param overrides when set). The context param is sent as a system prompt (not prepended to user message, so it is not echoed back).
@category external
export def "prim-llm" [
    --model:      string = ""    # Model ID — overrides LLM_MODEL env var when set
    --context:    string = ""    # [wirable] System prompt sent as system role (not prepended to user message)
    --max_tokens: string = "1024"  # Max tokens to generate
]: string -> string {
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
        error make {msg: "llm: no API key — set LLM_API_KEY or ANTHROPIC_API_KEY in server env. For a local model, set LLM_ENDPOINT to an OpenAI-compatible URL (e.g. http://host.docker.internal:1234/v1/chat/completions for LM Studio)."}
    }

    let input = $in
    let max_tok = ($max_tokens | into int)

    if $use_anthropic {
        # Anthropic uses a top-level `system` field, not a system role in messages
        let body = if ($context | is-empty) {
            {model: $resolved_model, max_tokens: $max_tok, messages: [{role: "user", content: $input}]}
        } else {
            {model: $resolved_model, max_tokens: $max_tok, system: $context, messages: [{role: "user", content: $input}]}
        }
        let resp = (http post $url
            --headers {x-api-key: $api_key, anthropic-version: "2023-06-01", content-type: "application/json"}
            ($body | to json))
        $resp | get content.0.text
    } else {
        # OpenAI-compatible: context becomes a system role message
        let messages = if ($context | is-empty) {
            [{role: "user", content: $input}]
        } else {
            [{role: "system", content: $context}, {role: "user", content: $input}]
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
            # Reasoning models (Gemma, DeepSeek-R1, QwQ, etc.) put answer in reasoning_content
            try { $msg | get reasoning_content | default "" } catch { "" }
        } else {
            $content
        }
    }
}
