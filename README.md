# Feed Graph

An RSS news aggregator that uses LLMs to build a navigable graph of relationships between articles, entities (people, companies, technologies), and categories. Articles flow in from user-configured RSS feeds, get classified along user-defined axes, deduplicated across sources, and surface as a knowledge graph rendered with react-flow.

## Demo Credentials

A demo dataset is seeded automatically on first `docker compose up` so reviewers see a working graph within seconds, with no API keys required.

| Field    | Value                  |
| -------- | ---------------------- |
| Email    | `demo@feedgraph.local` |
| Password | `demo123456`           |

The seed inserts a pre-confirmed user, 3 feeds (Cloudflare Blog / OpenAI News / Hacker News), 13 articles distributed across the pipeline states (`processed`, `filtered`, `pending_llm`), 8 entities cross-mentioned across articles, and full category + axis assignments. One pair of articles shares a `content_hash` across two feeds to demonstrate the "N similar in other sources" counter.

The seed is **idempotent**: it skips silently if `demo@feedgraph.local` already exists. There is no destructive re-seed — if you want a clean slate, run `docker compose down -v` and bring the stack back up.

To disable the auto-seed, set `SEED_DEMO_ON_BOOT=false` (in `.env` or the compose env block). To run the seed manually after disabling:

```bash
docker compose exec backend npm run seed:demo
```

The CLI is also available outside Docker via `npm run seed:demo:dev -w @feedgraph/backend` against a reachable local Postgres.

## Local Development

### Full stack via Docker

```bash
docker compose up -d
```

| URL                         | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| http://localhost:8080       | Frontend (nginx + reverse proxy to API)  |
| http://localhost:8080/api/* | Backend (proxied — single origin)        |
| http://localhost:3000       | Backend (direct, useful for curl)        |
| http://localhost:3030       | Bull Board (queue monitoring, basic-auth)|

Sign in with the demo credentials above; the seed runs on first boot.

### Frontend dev with HMR

When iterating on the UI, run Vite on the host and keep the rest of the stack in Docker:

```bash
docker compose up -d postgres redis backend bull-board
cd packages/frontend && npm run dev
```

Vite serves the SPA at http://localhost:5173 and proxies `/api/*` and `/debug/*` to the backend on `localhost:3000`. The frontend code never sees the difference between the dev proxy and the production nginx proxy.

### Backend dev outside Docker

```bash
docker compose up -d postgres redis
npm run start:dev -w @feedgraph/backend
```
