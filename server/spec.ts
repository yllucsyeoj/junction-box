import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Port { name: string; type: string; role?: string }
export interface ParamSpec { name: string; type: string; required: boolean; wirable: boolean; description: string; options?: string[]; format?: 'nuon' | 'plain' }
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
# Extension fallback — commands without @category use *_PRIMITIVE_META if available
let ext_meta = (
    scope variables
    | where name =~ '_PRIMITIVE_META$'
    | each {|v| $v.value}
    | reduce --fold {} {|it, acc| $acc | merge $it}
)

let category_colors = {
    input: "#f97316", transform: "#3b82f6", compute: "#eab308",
    logic: "#ec4899", output: "#22c55e", external: "#a855f7",
    file: "#f97316", datetime: "#06b6d4"
}

let cmds = (scope commands | where name =~ '^prim-' | where type == 'custom')

let specs = ($cmds | each {|cmd|
    let short_name = ($cmd.name | str replace 'prim-' '' | str replace --all '-' '_')
    let ext_m = ($ext_meta | get -o $short_name)

    let category = if ($cmd.category | is-not-empty) {
        $cmd.category
    } else if $ext_m != null {
        ($ext_m | get -o category | default 'other')
    } else { 'other' }

    let color = ($category_colors | get -o $category | default "#6b7280")
    let agent_hint = ($cmd.description | default '')

    let sig_rows = ($cmd.signatures | transpose key val | first | get val)
    let in_type = ($sig_rows | where parameter_type == 'input' | first | get syntax_shape | default 'any')
    let out_type = ($sig_rows | where parameter_type == 'output' | first | get syntax_shape | default 'any')

    let params = ($sig_rows
        | where parameter_type == 'named'
        | where parameter_name != 'help'
        | each {|p|
            let desc = ($p.description | default '')
            let wirable  = ($desc | str contains '[wirable]')
            let required = ($desc | str contains '[required]') or (not $p.is_optional)
            let opts_m   = ($desc | parse --regex '\\[options:(?P<o>[^\\]]+)\\]')
            let options  = if ($opts_m | is-empty) { null } else { $opts_m | first | get o | split row ',' }
            let fmt_m    = ($desc | parse --regex '\\[format:(?P<f>[^\\]]+)\\]')
            let fmt      = if ($fmt_m | is-empty) { null } else { $fmt_m | first | get f }
            let ext_opts = ($ext_m | get -o param_options | default {} | get -o $p.parameter_name)
            let ext_wire = ($ext_m | get -o wirable | default [] | any {|w| $w == $p.parameter_name})
            let final_opts = if $options != null { $options } else if $ext_opts != null { $ext_opts } else { null }
            let final_wire = $wirable or $ext_wire
            let clean_desc = ($desc | str replace --all --regex '\\[[^\\]]*\\]' '' | str trim)
            let base = { name: $p.parameter_name, type: ($p.syntax_shape | default 'string'),
                         required: $required, wirable: $final_wire, description: $clean_desc }
            let base = if $final_opts != null { $base | insert options $final_opts } else { $base }
            if $fmt != null { $base | insert format $fmt } else { $base }
        })

    let wirable_ports = ($params | where {|p| $p.wirable} | each {|p|
        {name: $p.name, type: $p.type, role: "param"}
    })
    {
        name: ($cmd.name | str replace 'prim-' '')
        category: $category
        color: $color
        agent_hint: $agent_hint
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
  const primDir = resolve(ROOT, 'primitives')
  const primitiveFiles = existsSync(primDir)
    ? (readdirSync(primDir, { recursive: true }) as string[])
        .filter(f => f.endsWith('.nu'))
        .map(f => `primitives/${f}`)
    : ['primitives.nu']  // fallback

  const extDir = resolve(ROOT, 'extensions')
  const extensionFiles = existsSync(extDir)
    ? readdirSync(extDir).filter(f => f.endsWith('.nu')).map(f => `extensions/${f}`)
    : []

  const useLines = [...primitiveFiles, ...extensionFiles]
    .map(f => `use ${f} *`)
    .join('\n')

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
