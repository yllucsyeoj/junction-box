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
let category_colors = {
    input: "#f97316", transform: "#3b82f6", compute: "#eab308",
    logic: "#ec4899", output: "#22c55e", external: "#a855f7",
    file: "#f97316", datetime: "#06b6d4",
    bls: "#0891b2", coingecko: "#6c46c7", feargreed: "#ef4444",
    fred: "#059669", github: "#24292f", hn: "#f97316",
    web: "#3b82f6", market: "#10b981", reddit: "#ff4500",
    rss: "#f97316", sec: "#6366f1", wikipedia: "#6b7280",
    youtube: "#ef4444"
}

let cmds = (scope commands | where name =~ '^prim-' | where type == 'custom')

let specs = ($cmds | each {|cmd|
    let category = if ($cmd.category | is-not-empty) { $cmd.category } else { 'other' }
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
            let clean_desc = ($desc | str replace --all --regex '\\[[^\\]]*\\]' '' | str trim)
            let base = { name: $p.parameter_name, type: ($p.syntax_shape | default 'string'),
                         required: $required, wirable: $wirable, description: $clean_desc }
            let base = if $options != null { $base | insert options $options } else { $base }
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
    ? (readdirSync(extDir, { recursive: true }) as string[])
        .filter(f => f.endsWith('.nu') && !f.split('/').pop()!.startsWith('_'))
        .map(f => `extensions/${f}`)
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
