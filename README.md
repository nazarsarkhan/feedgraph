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
