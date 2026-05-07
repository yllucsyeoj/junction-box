# Concatenate strings: prepend --prefix and/or append --suffix. Both ports are wirable. Param values are plain strings — whitespace is preserved.
@category compute
export def "prim-str-concat" [
    --prefix: string = ""            # [wirable] String to prepend (or wire an edge to this port)
    --suffix: string = ""            # [wirable] String to append  (or wire an edge to this port)
]: string -> string {
    # Params arrive as raw strings for static values, or JSON-encoded strings for wired inputs.
    # Wired values are always JSON-encoded (start with '"', '[', or '{').
    # Static values are plain strings — pass them through unchanged to preserve whitespace.
    let prefix_val = if ($prefix | str starts-with '"') { try { $prefix | from json } catch { $prefix } } else { $prefix }
    let suffix_val = if ($suffix | str starts-with '"') { try { $suffix | from json } catch { $suffix } } else { $suffix }
    $"($prefix_val)($in)($suffix_val)"
}
