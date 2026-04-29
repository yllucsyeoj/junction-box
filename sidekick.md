Sidekick LLM Approach
Pros:

- Focused model excels at graph construction only
- Smaller/faster model possible since it's specialized
- Main model stays focused on reasoning, not syntax
- Could iterate on graph construction independently
- Easier to optimize/evaluate
  Cons:
- Two models to run, more infrastructure
- Latency: main → sidekick → parse → execute
- Still need the sidekick to understand the same graph format
- Adds complexity to the system
  Lighter Alternatives

1. Few-shot system prompt — Embed 5-10 example graph constructions in the main model's context. Never needs to look up docs.
2. Validation loop — Build graph → send to /exec → if validation fails, return error → model fixes → retry. Simple feedback loop.
3. Structured output mode — Have /exec accept a natural language description ("fetch users where age > 21, sort by name") and the server constructs the graph internally. Main model just describes intent.
4. Smaller graph-specific model — Not a general LLM, but a fine-tuned small model (like a code-specific model) that only translates simple descriptions to graph JSON. Could run locally.
   Questions to Consider

- How often will the main model need to construct graphs? If it's rare, the sidekick overhead may not be worth it. If it's frequent, the sidekick could pay off.
- What's the failure mode now? Is the main model bad at constructing graphs, or just needs better docs?
- Do you want to run this locally? A sidekick could be a quantized small model (like Phi-3 or Mistral) running locally, keeping data private.
  The current GET / + GET /patterns approach might already solve 80% of the problem. Worth trying first before adding the sidekick complexity.
  My instinct: Try the validation loop first (simple retry mechanism), then if that's not enough, a small fine-tuned local model might be better than a sidekick calling an external service.
