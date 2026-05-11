# Search Hugging Face models by query. Returns a table with modelId, author, pipelineTag, downloads, likes, library, createdAt, and url per model. Set HF_TOKEN env var for higher rate limits.
@category ml
export def "prim-huggingface-models" [
    --search: string = ""      # [wirable] Search query for model name/description
    --task: string = ""        # Filter by pipeline tag: text-classification, text-generation, image-classification, etc.
    --library: string = ""     # Filter by library: transformers, diffusers, sentence-transformers, etc.
    --limit: string = "10"     # Max results (1–100)
    --sort: string = "downloads" # Sort by: downloads, likes, trending, created, modified
    --direction: string = "-1"  # Sort direction: -1 = descending, 1 = ascending
]: nothing -> table {
    let s = if ($search | str starts-with '"') { try { $search | from json } catch { $search } } else { $search }

    let clamped = ([($limit | into int), 1] | math max)
    let clamped = ([$clamped, 100] | math min)
    let valid_sorts = ["downloads", "likes", "trending", "created", "modified"]
    let sort_val = if ($sort in $valid_sorts) { $sort } else { "downloads" }
    let dir_val = if ($direction | into int) < 0 { -1 } else { 1 }

    let query_params = {
        limit: ($clamped | into string)
        sort: $sort_val
        direction: ($dir_val | into string)
    }
    let query_params = if ($s | is-empty) { $query_params } else { $query_params | insert search $s }
    let query_params = if ($task | is-empty) { $query_params } else { $query_params | insert pipeline_tag $task }
    let query_params = if ($library | is-empty) { $query_params } else { $query_params | insert library $library }

    let url = ({
        scheme: "https",
        host: "huggingface.co",
        path: "/api/models",
        params: $query_params
    } | url join)

    let headers = {User-Agent: "junction-box/1.0"}
    let headers = if ("HF_TOKEN" in $env and ($env.HF_TOKEN | str length) > 0) {
        $headers | insert Authorization $"Bearer ($env.HF_TOKEN)"
    } else { $headers }

    let resp = (http get -H $headers $url)
    if ($resp | is-empty) { return [] }

    $resp | each {|m|
        {
            modelId:      ($m.modelId? | default ($m.id? | default ""))
            author:       ($m.author? | default ($m.modelId? | default "" | split row '/' | get 0))
            pipelineTag:  ($m.pipeline_tag? | default "")
            description:  ($m.description? | default "" | str substring 0..200)
            downloads:    ($m.downloads? | default 0)
            likes:        ($m.likes? | default 0)
            library:      ($m.library_name? | default "")
            createdAt:    ($m.createdAt? | default "")
            url:          ($m.modelId? | default "" | $"https://huggingface.co/($in)")
        }
    }
}