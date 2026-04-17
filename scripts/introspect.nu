#!/usr/bin/env nu
# Standalone introspection tool — outputs JSON node spec for core primitives.
# Run from project root: nu scripts/introspect.nu
#
# Note: the server (spec.ts) generates the full Nu script dynamically to include
# extensions/, since Nu's `use` requires compile-time paths.

use ../primitives.nu *

let core_meta = $PRIMITIVE_META

let cmds = (scope commands | where name =~ '^prim-' | where type == 'custom')

let specs = ($cmds | each {|cmd|
    let short_name = ($cmd.name | str replace 'prim-' '' | str replace --all '-' '_')
    let name_parts = ($cmd.name | str replace 'prim-' '' | split row '-')
    let auto_category = if ($name_parts | length) > 1 { $name_parts | first } else { "other" }

    let m = ($core_meta | get -o $short_name | default {
        category: $auto_category
        color: "#6b7280"
        agent_hint: ($cmd.description | default "")
    })

    # Extract params and IO types from signatures
    # signatures is a record keyed by input type, value is table of parameters
    let sig_rows = ($cmd.signatures | transpose key val | first | get val)

    let in_type = ($sig_rows | where parameter_type == 'input' | first | get syntax_shape | default 'any')
    let out_type = ($sig_rows | where parameter_type == 'output' | first | get syntax_shape | default 'any')

    let params = ($sig_rows
        | where parameter_type == 'named'
        | where parameter_name != 'help'
        | each {|p| {
            name: $p.parameter_name
            type: ($p.syntax_shape | default 'string')
            required: (not $p.is_optional)
            description: ($p.description | default '')
        }})

    {
        name: ($cmd.name | str replace 'prim-' '')
        category: $m.category
        color: $m.color
        agent_hint: $m.agent_hint
        description: ($cmd.description | default "")
        ports: {
            inputs: [{name: "input", type: $in_type}]
            outputs: [{name: "output", type: $out_type}]
        }
        params: $params
    }
})

$specs | to json
