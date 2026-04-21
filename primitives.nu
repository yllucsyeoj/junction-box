# GoNude core primitives
# Modular structure: definitions are in primitives/{category}/*.nu
# This file is a thin wrapper that loads all modules and exports PRIMITIVE_META.

# Load all modular primitives
use primitives/input/mod.nu *
use primitives/transform/mod.nu *
use primitives/compute/mod.nu *
use primitives/datetime/mod.nu *
use primitives/logic/mod.nu *
use primitives/output/mod.nu *
use primitives/file/mod.nu *
use primitives/external/mod.nu *

# ── PRIMITIVE_META ────────────────────────────────────────────────────────────
# Metadata used by server/spec.ts for canvas display and agent hints.
# Keys match the short name (strip "prim-", replace "-" with "_").

export const PRIMITIVE_META = {
    fetch:         {category: "input",     color: "#f97316", wirable: [],               agent_hint: "Fetch JSON/table data from a URL via HTTP GET", param_options: {}}
    const:         {category: "input",     color: "#f97316", wirable: [],               agent_hint: "Provide a fixed NUON constant value (e.g. 42, \"hello\", [1 2 3])", param_options: {}}
    env:           {category: "input",     color: "#f97316", wirable: [],               agent_hint: "Read an environment variable by name, returns its string value", param_options: {}}
    file_in:       {category: "input",     color: "#f97316", wirable: [],               agent_hint: "Read a file — auto-detects CSV/JSON/NUON, else returns raw string", param_options: {}}
    ls:            {category: "file",      color: "#f97316", wirable: [],               agent_hint: "List directory contents as a table (name, type, size, modified)", param_options: {}}
    rm:            {category: "file",      color: "#f97316", wirable: [],               agent_hint: "Remove a file at the given path", param_options: {}}
    mkdir:         {category: "file",      color: "#f97316", wirable: [],               agent_hint: "Create a directory (and parents) at the given path", param_options: {}}
    date_now:      {category: "datetime",  color: "#06b6d4", wirable: [],               agent_hint: "Return the current date and time as a datetime value", param_options: {}}
    date_add:      {category: "datetime",  color: "#06b6d4", wirable: [],               agent_hint: "Add a duration to a datetime. amount examples: 1day, 2hr, 30min, -7day", param_options: {}}
    to_timezone:   {category: "datetime",  color: "#06b6d4", wirable: [],               agent_hint: "Convert datetime to a different timezone", param_options: {}}
    list_timezone: {category: "datetime",  color: "#06b6d4", wirable: [],               agent_hint: "List available timezone names", param_options: {}}
    into_filesize: {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Convert a string like 5MB into a filesize value", param_options: {}}
    into_duration: {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Convert a string like 1hr 30min into a duration value", param_options: {}}
    filter:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Filter table rows: pick column, op (>, <, ==, !=, contains), and value"
                   param_options: {op: ["==", "!=", ">", "<", "contains"]}}
    map:           {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Add or replace a column with a NUON constant value", param_options: {}}
    select:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Keep only the named columns from a table (space-separated)", param_options: {}}
    sort:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Sort a table by a column. direction: asc or desc"
                   param_options: {direction: ["asc", "desc"]}}
    count:         {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Count the number of rows in a table", param_options: {}}
    first:         {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Return the first N rows of a table", param_options: {}}
    last:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Return the last N rows of a table", param_options: {}}
    rename:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Rename a column: provide old and new column name", param_options: {}}
    get:           {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Get a field from a record or an index from a list", param_options: {}}
    merge:         {category: "transform", color: "#3b82f6", wirable: ["with"],         agent_hint: "Merge a NUON record into the input record — overlapping keys overwritten. Wire a record to --with for multi-input.", param_options: {}}
    reject:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Remove named columns from a table or record (space-separated)", param_options: {}}
    update:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Update a field in a record/table with a NUON value", param_options: {}}
    group_by:      {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Group table rows by a column — returns a record keyed by the column values", param_options: {}}
    reduce:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Reduce a list to a single value: sum, product, min, max, avg, or join"
                   param_options: {op: ["sum", "product", "min", "max", "avg", "join"]}}
    uniq:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Return unique values from a list (deduplicate)", param_options: {}}
    append:        {category: "transform", color: "#3b82f6", wirable: ["items"],        agent_hint: "Append to a list. Wire a second list/value to --items for multi-input.", param_options: {}}
    flatten:       {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Flatten one level of nesting from a list of lists", param_options: {}}
    reverse:       {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Reverse a list or table", param_options: {}}
    drop:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Skip the first N rows/elements from a list or table", param_options: {}}
    enumerate:     {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Add a zero-based index field to each element — returns [{index, value}, ...]", param_options: {}}
    wrap:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Wrap a single value into a one-element list", param_options: {}}
    join:          {category: "transform", color: "#3b82f6", wirable: ["right"],        agent_hint: "SQL-style join two tables on a shared column. Wire second table to --right port."
                   param_options: {type: ["inner", "left"]}}
    table_concat:  {category: "transform", color: "#3b82f6", wirable: ["more"],         agent_hint: "Vertically stack two tables (UNION ALL). Wire the second table to --more port.", param_options: {}}
    insert_row:    {category: "transform", color: "#3b82f6", wirable: ["row"],          agent_hint: "Append a record as a new row to a table. Wire a record source to --row port.", param_options: {}}
    col_to_list:   {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Extract a single column from a table as a flat list.", param_options: {}}
    col_stats:     {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Compute count/sum/avg/min/max for a numeric column. Returns a record.", param_options: {}}
    summarize:     {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Multi-column aggregate: --cols 'a b' --ops 'avg sum'. Returns a record of col_op keys."
                   param_options: {ops: ["avg", "sum", "min", "max", "count"]}}
    null_fill:     {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Fill null values in a table column with a NUON constant or forward-fill."
                   param_options: {op: ["const", "ffill"]}}
    group_agg:     {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Aggregate a group_by record into a [{group, value}] summary table."
                   param_options: {op: ["avg", "sum", "min", "max", "count", "first"]}}
    transpose:     {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Transpose a table (rows become columns) or convert a record to a [{column, value}] table.", param_options: {}}
    values:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Extract the values of a record as a list (complement to columns).", param_options: {}}
    columns:       {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Extract the column names of a table or record as a list.", param_options: {}}
    zip:           {category: "transform", color: "#3b82f6", wirable: ["right"],        agent_hint: "Zip two parallel lists into a table of records. Wire second list to --right port. --key_a / --key_b name the fields.", param_options: {}}
    batch:         {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Split a list into chunks of --size elements. Returns a list of lists.", param_options: {}}
    window:        {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Rolling N-row window aggregate over a table column. Adds a rolling result column."
                   param_options: {op: ["avg", "sum", "min", "max"]}}
    items:         {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Convert a record to a [{key, value}] table — complement to columns.", param_options: {}}
    find:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Find the index of the first list element matching a condition ($in = element).", param_options: {}}
    row:           {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Get a row at a specific index from a table.", param_options: {}}
    move:          {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Move a column to a new position in a table. Use --before to insert before another column.", param_options: {}}
    chunk_by:      {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Group consecutive list elements by a predicate — splits when value changes.", param_options: {}}
    match:         {category: "logic",     color: "#ec4899", wirable: [],               agent_hint: "Multi-way conditional: match a value against patterns. Patterns separated by spaces, each pattern:result pair colon-delimited."
                   param_options: {}}
    try:           {category: "logic",     color: "#ec4899", wirable: [],               agent_hint: "Try an expression, return fallback NUON on error.", param_options: {}}
    catch:         {category: "logic",     color: "#ec4899", wirable: [],               agent_hint: "Catch errors and handle them with a handler expression.", param_options: {}}
    for:           {category: "logic",     color: "#ec4899", wirable: [],               agent_hint: "Iterate over a list, accumulate results. $in = current element, $acc built up in --init accumulator.", param_options: {}}
    while:         {category: "logic",     color: "#ec4899", wirable: [],               agent_hint: "While loop with condition and body expressions. --max-iter prevents infinite loops.", param_options: {}}
    display:       {category: "output",    color: "#22c55e", wirable: [],               agent_hint: "Display the value (writes to stderr) and pass it through — safe to use mid-pipeline.", param_options: {}}
    file_out:      {category: "output",    color: "#22c55e", wirable: [],               agent_hint: "Write the value to a file. format: json, csv, text, or nuon"
                   param_options: {format: ["json", "csv", "text", "nuon"]}}
    return:        {category: "output",    color: "#22c55e", wirable: [],               agent_hint: "Return the pipeline result as the final output (pass-through terminal node)", param_options: {}}
    llm:           {category: "external",  color: "#a855f7", wirable: ["context"],
                   agent_hint: "Call an LLM. Config via server env: LLM_ENDPOINT (empty=Anthropic cloud, set for OpenAI-compatible/local), LLM_API_KEY, LLM_MODEL (default model ID — node param overrides when set). The context param is sent as a system prompt (not prepended to user message, so it is not echoed back)."
                   param_options: {}}
    analyze:       {category: "external",  color: "#a855f7", wirable: [],
                   agent_hint: "Send a table to an LLM for analysis. Formats rows as numbered items [1]..[N] so the model can cite sources by number. --fields selects which columns to include (comma-sep; default: all except noise cols). --prompt sets the task. Returns a string."
                   param_options: {}}
    http_post:     {category: "external",  color: "#a855f7", wirable: [],               agent_hint: "HTTP POST request — pipe body in, get response back", param_options: {}}
    http_put:      {category: "external",  color: "#a855f7", wirable: [],               agent_hint: "HTTP PUT request — pipe body in, get response back", param_options: {}}
    http_delete:   {category: "external",  color: "#a855f7", wirable: [],               agent_hint: "HTTP DELETE request", param_options: {}}
    http_patch:    {category: "external",  color: "#a855f7", wirable: [],               agent_hint: "HTTP PATCH request — pipe body in, get response back", param_options: {}}
    http_head:     {category: "external",  color: "#a855f7", wirable: [],               agent_hint: "HTTP HEAD request — returns headers only", param_options: {}}
    hash:          {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Compute hash of a string: md5, sha256", param_options: {algo: ["md5", "sha256"]}}
    encode_base64: {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Encode a string to base64", param_options: {}}
    decode_base64: {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Decode a base64 string to plain text", param_options: {}}
    encode_hex:    {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Encode a string to hex", param_options: {}}
    decode_hex:    {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Decode a hex string to plain text", param_options: {}}
    math:          {category: "compute",   color: "#eab308", wirable: ["operand"],      agent_hint: "Apply a math operation (+, -, *, /) to a number. Wire a number to --operand for multi-input."
                   param_options: {op: ["+", "-", "*", "/"]}}
    string_op:     {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Apply a string operation: upcase, downcase, trim, length, split, replace, starts-with, ends-with, contains, substring (arg: old:new)"
                   param_options: {op: ["upcase", "downcase", "trim", "length", "split", "replace", "starts-with", "ends-with", "contains", "substring"]}}
    compact:       {category: "transform", color: "#3b82f6", wirable: [],               agent_hint: "Remove null values from a list or table", param_options: {}}
    glob:          {category: "file",      color: "#f97316", wirable: [],               agent_hint: "Find files matching a glob pattern (e.g. **/*.json)", param_options: {}}
    path_parse:     {category: "file",      color: "#f97316", wirable: [],               agent_hint: "Parse a file path into its components (dir, stem, extension)", param_options: {}}
    path_join:     {category: "file",      color: "#f97316", wirable: [],               agent_hint: "Join path components into a full path", param_options: {}}
    type_cast:     {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Cast a value to a target type: int, float, string, bool"
                   param_options: {target: ["int", "float", "string", "bool"]}}
    math_fn:       {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Apply a math function: round/floor/ceil/abs on a number, or sum/min/max/avg/sqrt/median/stddev on a list or table column"
                   param_options: {op: ["round", "floor", "ceil", "abs", "sum", "min", "max", "avg", "sqrt", "median", "stddev"]}}
    each:          {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Apply a Nu expression to every element of a list. Use $in for the current element. e.g. $in * 2", param_options: {}}
    str_concat:    {category: "compute",   color: "#eab308", wirable: ["prefix", "suffix"], agent_hint: "Concatenate strings: prepend --prefix and/or append --suffix. Both ports are wirable. Param values are plain strings — do NOT use NUON quoting (set prefix to label= not \\\"label=\\\").", param_options: {}}
    str_interp:    {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Template string interpolation — input must be a record; use {field} placeholders in --template", param_options: {}}
    url_encode:    {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Percent-encode a string for safe use in a URL", param_options: {}}
    url_decode:    {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Decode a percent-encoded URL string", param_options: {}}
    to_json:       {category: "output",    color: "#22c55e", wirable: [], agent_hint: "Serialize any value to a JSON string", param_options: {}}
    to_csv:        {category: "output",    color: "#22c55e", wirable: [], agent_hint: "Serialize a table to a CSV string", param_options: {}}
    to_text:       {category: "output",    color: "#22c55e", wirable: [], agent_hint: "Convert any value to a plain text string (into string)", param_options: {}}
    to_nuon:       {category: "output",    color: "#22c55e", wirable: [], agent_hint: "Serialize any value to a NUON string (Nu's native format)", param_options: {}}
    from_string:   {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Parse a string as JSON, NUON, CSV, TOML, or YAML into a value"
                   param_options: {format: ["json", "nuon", "csv", "toml", "yaml"]}}
    row_apply:     {category: "compute",   color: "#eab308", wirable: [],               agent_hint: "Apply a Nu expression to each table row ($in = row record). --as_col adds result as new column; omit to replace the row. IMPORTANT: when using --as_col, the expression must return a scalar (string/number/bool) — returning the whole row record creates a nested column that breaks downstream filter comparisons.", param_options: {}}
    date_format:   {category: "datetime",  color: "#06b6d4", wirable: [],               agent_hint: "Format a datetime as a string using a strftime pattern (default: %Y-%m-%d %H:%M:%S)", param_options: {}}
    into_datetime: {category: "datetime",  color: "#06b6d4", wirable: [],               agent_hint: "Parse a string into a datetime value — optionally provide a --fmt strftime pattern", param_options: {}}
    if:            {category: "logic",     color: "#ec4899", wirable: [],               agent_hint: "Conditional gate: pass input through if condition is true, else return --fallback NUON value"
                   param_options: {op: ["==", "!=", ">", "<", "is-empty", "is-not-empty"]}}
}