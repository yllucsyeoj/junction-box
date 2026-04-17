# GoNude extension template — copy this file to create a new extension.
#
# Naming convention:
#   Commands : prim-<extension>-<action>  (e.g. prim-nocodb-fetch-table)
#   Metadata : <EXTENSION>_PRIMITIVE_META  (e.g. NOCODB_PRIMITIVE_META)
#
# The server auto-discovers this file at startup via extensions/ directory scan.
# Category in the canvas UI is derived from the <extension> segment of the command name.
# Override with metadata for custom color and agent_hint.
#
# Drop your extension file in extensions/ and restart the server — no edits to primitives.nu needed.

export const EXAMPLE_PRIMITIVE_META = {
    example_echo: {
        category: "example"
        color: "#6b7280"
        agent_hint: "Returns the input string unchanged. Use as a passthrough for testing extensions."
    }
}

# Echo a string value unchanged (passthrough for testing)
export def "prim-example-echo" []: string -> string {
    $in
}
