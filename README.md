# Junction Box

A node-graph dataflow execution engine designed for LLM agents. Compose data pipelines as `{nodes, edges}` graphs, POST them to an API, and receive transformed data back.

Built on [Nushell](https://www.nushell.sh/) for data transformation, [Hono](https://hono.dev/) for the API, and [ReactFlow](https://reactflow.dev/) for the visual canvas.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
  - [API Endpoints](#api-endpoints)
  - [Example Pipeline](#example-pipeline)
- [Development](#development)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [Node Catalog](#node-catalog)
- [Docker Deployment](#docker-deployment)
- [Project Structure](#project-structure)
- [License](#license)

---

## Features

- **140+ built-in nodes** across 22 categories — from basic transforms to external data sources
- **Graph-based execution** — define pipelines as JSON/NUON node graphs with typed ports and edges
- **Topological execution** — automatic dependency resolution and parallelization where safe
- **Nushell-powered transforms** — all data operations delegate to Nushell subprocesses for robust structured data handling
- **LLM-native** — first-class `llm` and `analyze` nodes with support for Anthropic, OpenAI, and local models (LM Studio, Ollama)
- **Visual canvas** — ReactFlow frontend for building and running graphs interactively
- **Persistent patches** — save and reuse named pipeline graphs in SQLite
- **Streaming execution** — Server-Sent Events for real-time progress on the canvas
- **Mermaid diagrams** — generate ASCII flowcharts from any saved patch
- **Data source integrations** — Hacker News, Reddit, Wikipedia, YouTube, GitHub, RSS, SEC filings, FRED, BLS, CoinGecko, and more

---

## Quick Start

```bash
# Clone and enter the repo
cd junction-box

# Configure environment
cp .env.example .env
# Edit .env with your API keys (optional for basic usage)

# Run with Docker (recommended)
docker compose up --build

# Or run locally (requires Bun + Nushell)
cd server && bun install && bun run dev
```

The API is available at `http://localhost:3001`.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh/) | latest | JavaScript runtime and package manager |
| [Nushell](https://www.nushell.sh/) | 0.111.0 | Data transformation engine |
| [Docker](https://www.docker.com/) | (optional) | Containerized deployment |

Nushell must be on your `$PATH`. The Docker image includes Nushell automatically.

---

## Installation

### Local Development

**Backend:**

```bash
cd server
bun install
bun run dev          # --watch mode on port 3001
```

**Frontend:**

```bash
cd frontend
bun install
bun run dev          # Vite dev server
```

### Docker

```bash
# Build and run
docker compose up --build

# Or manually
docker build -t junction-box .
docker run --env-file .env \
  --add-host=host.docker.internal:host-gateway \
  -p 3001:3001 -v junction-box-data:/app/data junction-box
```

---

## Usage

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | LLM-oriented manifest and quick-start guide |
| `GET` | `/health` | Health check |
| `GET` | `/nodes` | Full node specification array |
| `GET` | `/catalog` | Token-efficient catalog (filter with `?category=`) |
| `GET` | `/defs/:type` | Single node definition + example |
| `GET` | `/defs` | All node definitions |
| `GET` | `/patterns` | Pre-built pipeline patterns |
| `POST` | `/exec` | **Synchronous graph execution** |
| `POST` | `/run` | **SSE streaming execution** (for canvas) |
| `POST` | `/patch` | Save a named graph patch |
| `GET` | `/patch/:alias` | Retrieve a patch |
| `DELETE` | `/patch/:alias` | Delete a patch |
| `GET` | `/patches` | List all patches |
| `GET` | `/runs/:run_id` | Retrieve run result |
| `GET` | `/runs` | List runs (paginated) |
| `GET` | `/logs` | Raw execution log (`runs.jsonl`) |
| `POST` | `/parse-nuon` | Parse NUON text to JSON |
| `GET` | `/visualise/:alias` | ASCII Mermaid flowchart |

### Example Pipeline

```bash
curl -X POST http://localhost:3001/exec \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      { "id": "a", "type": "const", "params": { "value": "hello" } },
      { "id": "b", "type": "string_op", "params": { "op": "uppercase" } }
    ],
    "edges": [
      { "from": "a", "to": "b", "fromPort": "out", "toPort": "in" }
    ]
  }'
```

More examples are in `junction-box-graphs/`.

---

## Development

The backend entrypoint is `server/index.ts` (Hono app). It auto-discovers Nushell primitives from `primitives.nu` and `extensions/*.nu` via `server/spec.ts`.

Key server modules:

| File | Purpose |
|------|---------|
| `server/db.ts` | SQLite schema and CRUD |
| `server/validate.ts` | Pre-flight graph validation (types, ports, cycles) |
| `server/execute.ts` | Runtime execution + error normalization |
| `server/exec-runner.ts` | Execution orchestration |
| `server/spec.ts` | Dynamic introspection of Nushell primitives |
| `server/toposort.ts` | Topological sort utility |
| `server/mermaid.ts` | Mermaid diagram generation |

The frontend is a standard React + Vite app using ReactFlow for the canvas.

---

## Testing

```bash
cd server
bun test
```

Tests cover SQLite persistence, schema validation, smoke tests, and per-category node tests (compute, datetime, input, logic, transform).

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_ENDPOINT` | No | OpenAI-compatible URL or empty for Anthropic cloud |
| `LLM_MODEL` | No | Default model ID (e.g. `claude-sonnet-4-6`, `gpt-4o`) |
| `LLM_API_KEY` | No | API key for LLM endpoint |
| `ANTHROPIC_API_KEY` | No | Alternative Anthropic key |
| `FRED_API_KEY` | No | For FRED economic data nodes |
| `BLS_API_KEY` | No | For BLS labor statistics nodes |

For LM Studio local models, use `http://host.docker.internal:1234/v1/chat/completions`.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Client    │────▶│  Hono API   │────▶│  Graph Engine   │
│  (Agent/UI) │◀────│  (Bun)      │◀────│  (validate +    │
└─────────────┘     └─────────────┘     │   toposort)     │
                                        └─────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────┐
                                        │  Nushell 0.111  │
                                        │  (primitives.nu │
                                        │   + extensions) │
                                        └─────────────────┘
```

Graphs are validated, topologically sorted, then executed by spawning Nushell commands prefixed with `prim-`. Results are normalized and returned as JSON.

---

## Node Catalog

Nodes are organized into categories. Core categories include:

| Category | Examples |
|----------|----------|
| `input` | `const`, `env`, `file_in`, `fetch` |
| `transform` | `filter`, `map`, `select`, `sort`, `join`, `table_concat`, `insert_row` |
| `compute` | `math`, `hash`, `encode_base64`, `string_op` |
| `logic` | `if`, `match`, `try`, `catch`, `for`, `while` |
| `datetime` | `date_now`, `date_add`, `to_timezone` |
| `output` | `return`, `display`, `file_out` |
| `external` | `llm`, `analyze` |
| `web` | `http_post`, `http_put`, `http_delete` |
| `hn` | Hacker News stories, comments, jobs |
| `reddit` | Subreddit posts, search |
| `wikipedia` | Article search, content extraction |
| `youtube` | Video search, transcript |
| `github` | Repo search, issues, commits |
| `rss` | Feed fetching and parsing |
| `market` | Stock quotes, fear/greed index |
| `coingecko` | Crypto prices, market data |
| `sec` | SEC filings search |
| `fred` | FRED economic series |
| `bls` | BLS labor statistics |

Retrieve the full catalog via `GET /catalog`.

---

## Docker Deployment

The `Dockerfile` uses a multi-stage build on Debian with Nushell and Bun included. `docker-compose.yml`:

- Exposes port `3001`
- Mounts `junction-box-data` volume for SQLite persistence
- Fixes `host.docker.internal` for Linux hosts

```bash
docker compose up --build
```

---

## Project Structure

```
junction-box/
├── bin/                    # Entry scripts and Nushell plugins
├── data/                   # SQLite DB, logs, datasets
├── docs/                   # Design docs and superpowers
├── extensions/             # Nushell data-source extensions (14 files)
├── frontend/               # React + Vite + ReactFlow UI
├── junction-box-graphs/    # 50+ example pipeline JSONs
├── patches/                # Legacy patch files
├── primitives.nu           # Core Nushell primitive definitions
├── scripts/                # Migration and introspection scripts
├── server/                 # Hono backend (TypeScript)
│   ├── index.ts            # Main API server
│   ├── db.ts               # SQLite layer
│   ├── validate.ts         # Graph validation
│   ├── execute.ts          # Execution engine
│   ├── spec.ts             # Nushell introspection
│   └── ...
├── tests/                  # Bun test suites
├── .env.example            # Environment template
├── docker-compose.yml
├── Dockerfile
└── ASSESSMENT.md           # API assessment report
```

---

## License

[MIT](LICENSE)
