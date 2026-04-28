import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Port { name: string; type: string }
export interface ParamSpec { name: string; type: string; required: boolean; wirable: boolean; description: string; options?: string[] }
export interface NodeSpec {
  name: string
  category: string
  color: string
  agent_hint: string
  input_type: string
  output_type: string
  description: string
  ports: { inputs: Port[]; outputs: Port[] }
  params: ParamSpec[]
}

const ROOT = resolve(import.meta.dir, '..')

// The introspection logic as a Nu template (no `use` statements — added dynamically)
const INTROSPECT_LOGIC = `
let core_meta = $PRIMITIVE_META

let ext_meta = (
    scope variables
    | where name =~ '_PRIMITIVE_META$'
    | where name != 'PRIMITIVE_META'
    | each {|v| $v.value}
    | reduce --fold {} {|it, acc| $acc | merge $it}
)
let all_meta = ($core_meta | merge $ext_meta)

let cmds = (scope commands | where name =~ '^prim-' | where type == 'custom')

let specs = ($cmds | each {|cmd|
    let short_name = ($cmd.name | str replace 'prim-' '' | str replace --all '-' '_')
    let name_parts = ($cmd.name | str replace 'prim-' '' | split row '-')
    let auto_category = if ($name_parts | length) > 1 { $name_parts | first } else { "other" }

    let m = ($all_meta | get -o $short_name | default {
        category: $auto_category
        color: "#6b7280"
        agent_hint: ($cmd.description | default "")
        param_options: {}
    })

    let param_opts = ($m | get -o param_options | default {})
    let wirable_list = ($m | get -o wirable | default [])

    let sig_rows = ($cmd.signatures | transpose key val | first | get val)
    let in_type = ($sig_rows | where parameter_type == 'input' | first | get syntax_shape | default 'any')
    let out_type = ($sig_rows | where parameter_type == 'output' | first | get syntax_shape | default 'any')

    let params = ($sig_rows
        | where parameter_type == 'named'
        | where parameter_name != 'help'
        | each {|p|
            let opts = ($param_opts | get -o $p.parameter_name | default null)
            let base = {
                name: $p.parameter_name
                type: ($p.syntax_shape | default 'string')
                required: (not $p.is_optional)
                wirable: ($wirable_list | any {|w| $w == $p.parameter_name})
                description: ($p.description | default '')
            }
            if $opts != null { $base | insert options $opts } else { $base }
        })

    let wirable_ports = ($params | where {|p| $p.wirable} | each {|p| {name: $p.name, type: $p.type, role: "param"}})
    {
        name: ($cmd.name | str replace 'prim-' '')
        category: $m.category
        color: $m.color
        agent_hint: $m.agent_hint
        input_type: $in_type
        output_type: $out_type
        description: ($cmd.description | default "")
        ports: {
            inputs: ([{name: "input", type: $in_type}] | append $wirable_ports)
            outputs: [{name: "output", type: $out_type}]
        }
        params: $params
    }
})

$specs | to json
`

export async function loadSpec(): Promise<NodeSpec[]> {
  // Discover extension files
  const extDir = resolve(ROOT, 'extensions')
  const extensionFiles = existsSync(extDir)
    ? readdirSync(extDir)
        .filter(f => f.endsWith('.nu'))
        .map(f => `extensions/${f}`)
    : []

  // Build Nu script: use statements + introspection logic
  const useLines = [
    'use primitives.nu *',
    ...extensionFiles.map(f => `use ${f} *`),
  ].join('\n')

  const fullScript = useLines + '\n' + INTROSPECT_LOGIC

  const proc = Bun.spawnSync(['nu', '-c', fullScript], {
    cwd: ROOT,
    stderr: 'pipe',
  })

  if (proc.exitCode !== 0) {
    throw new Error(`Introspection failed:\n${Buffer.from(proc.stderr).toString()}`)
  }

  return JSON.parse(Buffer.from(proc.stdout).toString())
}
