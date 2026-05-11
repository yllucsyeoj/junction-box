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
    youtube: "#ef4444",
    news: "#dc2626",
    blog: "#000000"
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
        # Params with [format:nuon] or [format:json] accept serialized data — the primitive
        # parses the string at runtime. Validation should allow any output type since the
        # execution layer serializes upstream output to JSON/NUON before passing via env var.
        let port_type = if ($p.format? | default '' | str contains 'nuon') or ($p.format? | default '' | str contains 'json') {
            'any'
        } else {
            $p.type
        }
        {name: $p.name, type: $port_type, role: "param"}
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

// Built-in specs for TypeScript-handled nodes (patch-call, kv-get, kv-set)
// These don't exist as Nu primitives so they're declared here and merged in.
const BUILTIN_SPECS: NodeSpec[] = [
  {
    name: 'patch-call',
    category: 'external',
    color: '#a855f7',
    agent_hint: 'Run a saved patch by alias and return its result inline. Use for reusable sub-pipelines and composition. Params: alias (required string), params (optional record of param values).',
    input_type: 'nothing',
    output_type: 'any',
    description: 'Run a saved patch by alias and return its result inline. Enables pipeline composition.',
    ports: {
      inputs: [{ name: 'input', type: 'nothing' }],
      outputs: [{ name: 'output', type: 'any' }],
    },
    params: [
      { name: 'alias', type: 'string', required: true, wirable: false, description: 'Alias of the saved patch to run' },
      { name: 'params', type: 'record', required: false, wirable: false, description: 'Runtime params to inject (JSON object matching the patch required params)' },
    ],
  },
  {
    name: 'kv-get',
    category: 'db',
    color: '#8b5cf6',
    agent_hint: 'Read a value from the persistent KV store by key. Returns the stored value or the default if not found or expired. Use with kv-set to share state across pipeline runs.',
    input_type: 'nothing',
    output_type: 'any',
    description: 'Read a persistent key-value entry from SQLite.',
    ports: {
      inputs: [{ name: 'input', type: 'nothing' }],
      outputs: [{ name: 'output', type: 'any' }],
    },
    params: [
      { name: 'key', type: 'string', required: true, wirable: false, description: 'Key to read' },
      { name: 'default', type: 'any', required: false, wirable: false, description: 'Value to return if key is not found (JSON value)' },
    ],
  },
  {
    name: 'kv-set',
    category: 'db',
    color: '#8b5cf6',
    agent_hint: 'Write the pipeline input to the persistent KV store under the given key, then pass it through unchanged. Use with kv-get to share state across pipeline runs. Optional TTL in seconds.',
    input_type: 'any',
    output_type: 'any',
    description: 'Write a persistent key-value entry to SQLite. Passes input through unchanged.',
    ports: {
      inputs: [{ name: 'input', type: 'any' }],
      outputs: [{ name: 'output', type: 'any' }],
    },
    params: [
      { name: 'key', type: 'string', required: true, wirable: false, description: 'Key to write' },
      { name: 'ttl_seconds', type: 'number', required: false, wirable: false, description: 'Optional time-to-live in seconds. Entry is deleted after this duration.' },
    ],
  },
]

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

  const nuSpecs: NodeSpec[] = JSON.parse(Buffer.from(proc.stdout).toString())
  return [...nuSpecs, ...BUILTIN_SPECS]
}
