Sentiment / Social

1. Reddit — old.reddit.com/r/wallstreetbets.json needs no auth, returns posts/comments as JSON.
   Instant retail sentiment. Combine with llm for sentiment scoring. r/investing, r/stocks,
   r/SecurityAnalysis all the same pattern.

2. Hacker News — Algolia's HN search API (hn.algolia.com/api/v1/search) is completely open.
   Best signal for tech company mindshare, AI product launches, founder activity. Complements YT
   well.

News / Text

3. RSS — A generic rss node covering any feed URL unlocks: Reuters, Yahoo Finance news, Seeking
   Alpha, MarketWatch, SEC press releases, earnings release wires. One node, massive surface
   area. Nu already parses XML natively so this is trivial.

4. Wikipedia — en.wikipedia.org/api/rest_v1/page/summary/{title} — zero auth, returns
   structured JSON. Useful for company background context before an LLM step, executive bios,
   industry classification.

Macro / Economic

5. FRED — St. Louis Fed free API. CPI, interest rates, unemployment, M2, yield curve, GDP. The
   macro layer that's currently missing. Needs a free API key but that's one env var.

6. BLS — Bureau of Labor Statistics free API. Sector-level employment, wage growth, PPI. Pairs
   well with screener output for macro-to-stock analysis.

Market Structure

7. Options flow — barchart.com exposes unusual options activity via scraping
   (barchart.com/options/unusual-activity). High put/call ratio, large block trades — the signals
   that often front-run moves. Harder scrape but high value.

8. CoinGecko — Free tier, no auth for basic endpoints. BTC dominance, crypto market cap, fear
   metrics. Relevant for macro risk-on/risk-off signal even in equity pipelines.

Alternative / Signals

9. Fear & Greed — alternative.me/crypto/fear-and-greed-index/ — single-number sentiment index,
   free JSON endpoint. Trivial to implement, useful as a gate node ("only run screener if market
   isn't in extreme fear").

10. GitHub — Unauthenticated API covers stars, commit frequency, contributor count for public
    repos. Useful for tech companies where developer adoption leads revenue (Snowflake, MongoDB,
    HashiCorp-type analysis).

---

Priority order after Reddit:

┌─────┬──────────────┬─────────────────────┬──────────┬──────────────────┐
│ # │ Source │ Auth needed │ Effort │ Unique value │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 1 │ Reddit │ None │ Low │ Retail sentiment │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 2 │ RSS/News │ None │ Very low │ Financial news │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 3 │ FRED │ Free key │ Low │ Macro layer │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 4 │ Hacker News │ None │ Low │ Tech mindshare │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 5 │ Fear & Greed │ None │ Trivial │ Market regime │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 6 │ Wikipedia │ None │ Low │ LLM context │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 7 │ GitHub │ None (rate-limited) │ Low │ Dev adoption │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 8 │ CoinGecko │ None │ Low │ Crypto/macro │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 9 │ Options flow │ Scraping │ Medium │ Smart money │
├─────┼──────────────┼─────────────────────┼──────────┼──────────────────┤
│ 10 │ BLS │ Free key │ Medium │ Sector macro │
└─────┴──────────────┴─────────────────────┴──────────┴──────────────────┘

RSS is probably the highest ROI — one node implementation and you cover dozens of sources
immediately.

---

Separate projects / dependencies

nu-plugin-htmd — wrap https://github.com/letmutex/htmd as a Nushell plugin so Nu has a
native `htmd` command (HTML → Markdown). Once this exists, prim-fetch-md becomes trivial
(~10 lines: http get | htmd) and prim-fetch-section (extract by heading from the markdown)
falls out for free. Do not implement in this repo — build as a standalone Rust plugin project.
