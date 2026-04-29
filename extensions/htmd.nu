export const HTMD_PRIMITIVE_META = {
    web_htmd: {
        category: "web"
        color: "#3b82f6"
        wirable: ["url"]
        required_params: ["url"]
        agent_hint: "Convert HTML or a URL to Markdown and rich metadata. Use --main to extract only main content, --no-images to strip images, --no-links to strip links, --raw for only markdown string."
    }
}

export def "prim-web-htmd" [
    --url: string = ""        # URL to fetch and convert
    --main                    # Extract only the main content
    --no-images               # Strip images from the output
    --no-links                # Strip links from the output
    --raw                     # Return only the markdown string
    --user-agent: string = "" # Custom User-Agent
]: nothing -> record {
    let url_val  = if ($url | str starts-with '"') { $url | from json } else { $url }
    let rawInput = if not ($url_val | is-empty) { $url_val } else { $in }
    let target = if ($rawInput | describe) == "string" {
        $rawInput
    } else if ($rawInput | describe) == "list" {
        if ($rawInput | is-empty) { "" } else { $rawInput | first | to text }
    } else {
        $rawInput | to text
    }

    if ($target | is-empty) {
        error make {msg: "provide --url"}
    }

    if $main and $no_images and $no_links and $raw and not ($user_agent | is-empty) {
        htmd --main --no-images --no-links --raw --user-agent $user_agent $target
    } else if $main and $no_images and $no_links and $raw {
        htmd --main --no-images --no-links --raw $target
    } else if $main and $no_images and $no_links and not ($user_agent | is-empty) {
        htmd --main --no-images --no-links --user-agent $user_agent $target
    } else if $main and $no_images and $no_links {
        htmd --main --no-images --no-links $target
    } else if $main and $no_images and not ($user_agent | is-empty) {
        htmd --main --no-images --user-agent $user_agent $target
    } else if $main and $no_images {
        htmd --main --no-images $target
    } else if $main and $no_links and not ($user_agent | is-empty) {
        htmd --main --no-links --user-agent $user_agent $target
    } else if $main and $no_links {
        htmd --main --no-links $target
    } else if $main and not ($user_agent | is-empty) {
        htmd --main --user-agent $user_agent $target
    } else if $main {
        htmd --main $target
    } else if $no_images and $no_links and $raw and not ($user_agent | is-empty) {
        htmd --no-images --no-links --raw --user-agent $user_agent $target
    } else if $no_images and $no_links and $raw {
        htmd --no-images --no-links --raw $target
    } else if $no_images and $no_links and not ($user_agent | is-empty) {
        htmd --no-images --no-links --user-agent $user_agent $target
    } else if $no_images and $no_links {
        htmd --no-images --no-links $target
    } else if $no_images and $raw and not ($user_agent | is-empty) {
        htmd --no-images --raw --user-agent $user_agent $target
    } else if $no_images and $raw {
        htmd --no-images --raw $target
    } else if $no_images and not ($user_agent | is-empty) {
        htmd --no-images --user-agent $user_agent $target
    } else if $no_images {
        htmd --no-images $target
    } else if $no_links and $raw and not ($user_agent | is-empty) {
        htmd --no-links --raw --user-agent $user_agent $target
    } else if $no_links and $raw {
        htmd --no-links --raw $target
    } else if $no_links and not ($user_agent | is-empty) {
        htmd --no-links --user-agent $user_agent $target
    } else if $no_links {
        htmd --no-links $target
    } else if $raw and not ($user_agent | is-empty) {
        htmd --raw --user-agent $user_agent $target
    } else if $raw {
        htmd --raw $target
    } else if not ($user_agent | is-empty) {
        htmd --user-agent $user_agent $target
    } else {
        htmd $target
    }
}