1. Biggest Design Deficiencies
   Wirable params are a footgun
   The [format:nuon] tag in Nu source files is the only thing that gates whether a param accepts structured data. This is completely invisible to an agent reading /catalog or /defs — the catalog just shows string for every param. An agent has no way to know that --items on append accepts a wired list versus --url on fetch which truly requires a string. This creates a trial-and-error trap.
   No execution introspection
   ?outputs=full gives per-node output but no timing, no per-node error differentiation, and no way to see what happened to an individual node without re-running the pipeline. When a 20-node pipeline fails on node 15, you can't inspect node 12's output in isolation.
   Validation and execution are decoupled
   Validation rejects type mismasses but doesn't pre-check that referenced series IDs, API keys, or external resources exist. A fred-series with an invalid series_id passes validation and fails at execution with a cryptic "network failure". The catalog shows 139 node types but no way to validate a graph against live external state before running.
   Patches are opaque artifacts
   GET /patch/:alias returns the raw graph JSON. There's no description of what data it produces, what parameters it accepts, what it depends on externally, or what the output schema looks like. Agents consuming patches from a shared registry have no way to understand them without executing them.

---

2. Missing or Hard-to-Use Features
   No streaming execution
   Pipelines run to completion before returning any result. Long-running pipelines (multiple external API calls) block until done. No way to get intermediate results as nodes complete.
   No way to test a single node
   Every pipeline requires at minimum a source node + return node. There's no /exec for a single node in isolation. To see what hn-search returns for a query, you need to construct a graph.
   No parameter validation at save time
   POST /patch validates the graph structure but doesn't check whether required params (like fred-series --series_id) are set. A patch can be saved with all params empty and only fail at runtime.
   No way to discover compatible nodes
   If an agent has a table output and wants to do something with it, it has to manually check which nodes accept table input. The compatibility matrix in validate.ts is code, not data. No /catalog?input_type=table filter.
   No retry/timeout control
   External API nodes (coingecko, fred, etc.) have no timeout configuration. If an API is slow or rate-limited, the entire pipeline fails. No way to set per-node timeout or retry count.
   No built-in control flow beyond if
   The if node substitutes values but doesn't route execution. There's no match equivalent that routes to different processing paths. No try/catch per node. No conditional branching.
   No way to see what a patch needs before running it
   A patch with **param**:ticker wires correctly but there's no endpoint that says "this patch needs these params, here's their types and descriptions." The agent has to read the graph or infer from the alias name.

---

3. What to Add for Next-Level Usefulness
   A PATCH /preview endpoint
   POST /preview with a patch alias + params returns the first 3 rows of each source node's output without running the full pipeline. Lets an agent verify it's getting the right data before committing to a full run.
   Streaming via SSE
   Use the existing SSE infrastructure in execute.ts to stream per-node results as they complete. This gives real-time feedback for long pipelines and lets agents decide to abort if something looks wrong early.
   A /catalog?category=X&accepts=table filter
   Explicit compatibility queries so an agent can ask "what nodes accept table input" or "what nodes produce a list". The data exists in the specs — just needs to be filterable.
   Per-node timeout and retry params
   Add --timeout_ms and --retries to external API nodes (fetch, http-, fred-series, coingecko-, etc.). Default to sensible values but let agents override.
   Patch metadata at save time
   POST /patch should accept optional input_schema and output_schema fields so agents can document what params a patch needs and what it returns. GET /patch/:alias should surface these.
   A GET /patch/:alias/explain endpoint
   Returns a natural language description of what a patch does, what each node is doing, and what the expected output format is. Built by having an LLM read the graph + agent_hint fields.
   Built-in retry with backoff
   For transient failures (network, rate limiting), the execution engine should automatically retry 1-2x with exponential backoff before surfacing the error. Currently every failure is immediate.

---

4. What Would Make It the Perfect Agentic Interface
   Universal tool-calling protocol
   Patches should be callable like tools: {"tool": "crypto-sentiment", "params": {}} with a defined JSON schema for inputs and outputs. Every patch becomes a typed tool in an agent's toolbelt.
   Declarative pipeline composition
   An agent should be able to say "run patch A, then feed its output into patch B" without manually merging graphs. A /compose endpoint that takes [aliasA, aliasB, ...] and a description of how to wire them.
   Self-documenting with execution history
   GET /patches should show not just the graph but: last run time, average run duration, success rate, last error. Agents choosing between patches for a task should see reliability data.
   Intelligent patch recommendations
   A POST /recommend endpoint that takes a natural language description of a data goal and returns the top 3 patches (from the registry) that could help, with explanations. "I want to know the current price of Bitcoin and community sentiment" → recommend crypto-sentiment.
   Provenance on every result
   Every result should include the run_id and a way to GET /runs/:run_id to trace exactly which nodes produced what, how long each took, and what the intermediate outputs were. Full auditability of any answer.
   Multi-agent collaboration primitives
   Patches that accept other patches as parameters. An agent creates a "bull market filter" patch, another agent wraps it into a "crypto dashboard" patch. Patches become composable building blocks rather than isolated scripts.
   The killer feature: natural language pipeline generation
   POST /generate with {"describe": "get the top 5 crypto prices from CoinGecko, fetch the fear/greed index, and ask an LLM if they're correlated"} → returns a valid graph that can be saved as a patch. Agents building their own pipelines from intent rather than graph construction.
