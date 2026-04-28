# Junction Box API Assessment

You are assessing the Junction Box API at `http://0.0.0.0:3001` from an agent's perspective.

## Rules

- **Explore only through the API.** Do not read source code, docs, or any local files.
- **Use only HTTP calls.** `curl` is fine. Start from `GET /` and follow what you find.
- **Treat yourself as the user.** You are an agent trying to get something done with this API. What confuses you? What wastes tokens? What makes you confident vs uncertain?

## What to Assess

Work through the API as an agent would: discover, build pipelines, handle errors, save work. As you go, note friction.

Cover at minimum:

- **Discovery** — How do you learn what's available? Is the first-contact surface sufficient? How much context does it cost?
- **Pipeline construction** — Build 3-5 real pipelines of increasing complexity. What goes wrong? How helpful are the errors?
- **Token efficiency** — How much of the response is signal vs noise? What would you not need if you already had the answer?
- **Consistency** — Do param formats, error shapes, naming conventions feel uniform across nodes?
- **Validation** — Does the API catch mistakes before running, or mid-run? How actionable are the messages?
- **Persistence** — Can you save and reuse a working pipeline? Does it work?
- **Type safety** — Does the schema tell you enough to wire nodes correctly without trial and error?

## What to Produce

A structured findings report with two sections:

### Findings
Each finding should have:
- What the issue is
- What you observed (the specific API behavior)
- Why it matters for an agent (token cost, confusion, failure modes)

### Recommendations
Concrete, prioritized changes. For each:
- What to add, change, or remove
- What agent behavior it enables or prevents
- Rough priority (high / medium / low)

## Framing

Think about this question throughout: **if you had to give another agent a single paragraph to orient them to this API before they used it, what would it say — and what gaps would it leave?** The gaps are what to fix.

---

## Orientation (post-assessment, updated)

Junction Box is a node-graph execution engine. Define a pipeline as `{nodes, edges}` and POST to `/exec` — it runs synchronously and returns `{status, result, errors}`. Start with `GET /` (a comprehensive LLM-oriented manifest), then `GET /catalog` (~7K tokens, 141 nodes) for discovery — it shows `name`, `category`, `input_type`, `output_type`, `agent_hint`, and `has_wirable_params` per node. Call `GET /defs/:type` for full param details before wiring. Key rules: source nodes (`const`, `fetch`, `hn-search`, etc.) have no input edge; every other node needs one; `return` or the last node yields `result`. Add `?outputs=full` to see per-node outputs for debugging. Save working pipelines with `POST /patch`.

**Critical things to know:**
- **22 node categories** — beyond the 8 core categories (input/transform/compute/etc.), there are 14 data-source categories: `hn`, `reddit`, `wikipedia`, `youtube`, `github`, `rss`, `web`, `market`, `coingecko`, `feargreed`, `sec`, `fred`, `bls`, `template`. Use `GET /catalog?category=hn` (etc.) to browse each.
- **`fetch.url` is wirable** — wire a string output to the `url` port to construct URLs dynamically.
- **Search node `query` params are required** — `hn-search`, `hn-comments`, `reddit-search`, `wiki-search` all require `--query`; omitting it fails at validation (422), not silently at runtime.
- **Validation (422) vs runtime (500)** — structural errors (bad params, wrong types, disconnected nodes) are caught pre-run with actionable messages. Network failures and expression errors are 500s at runtime.
- **`POST /parse-nuon`** accepts either raw NUON text (`Content-Type: text/plain`) or JSON `{"text": "..."}` (`Content-Type: application/json`) and returns the parsed JSON value.
- **`position` fields in nodes are ignored** — omit them to save tokens.
