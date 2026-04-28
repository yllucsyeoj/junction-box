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
