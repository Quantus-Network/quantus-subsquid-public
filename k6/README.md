# K6 GraphQL Capacity Tests

Breakpoint stress tests for the Hasura GraphQL API and Postgres. Goal: find the **maximum concurrent users** the current staging stack can sustain before error rate or latency thresholds fail.

## Prerequisites

```bash
brew install k6
```

Confirm K6 is available: `k6 version`.

## Target URL (bypass nginx limits)

Prefer hitting **Hasura directly** so nginx per-IP `limit_req` / `limit_conn` do not cap the run:

```text
http://<staging-host>:<BLUE_GQL_PORT|GREEN_GQL_PORT>/v1/graphql
```

Use the active environment’s mapped GraphQL port from staging `.env` / compose (`BLUE_GQL_PORT` or `GREEN_GQL_PORT` in `docker-compose.yml`).

### Fallback if Hasura ports are not reachable

1. On staging, temporarily comment out `limit_req` / `limit_conn` (and related zone directives if unused) in `nginx/nginx.conf`.
2. Reload nginx.
3. Point K6 at the public endpoint, e.g. `http://<staging-host>:4350/v1/graphql`.
4. **Restore nginx limits immediately after the test.**

## Auth

Scripts use the anonymous `public` role (no admin secret). That matches `HASURA_GRAPHQL_UNAUTHORIZED_ROLE` in deployment config.

## Smoke (always run first)

Validates URL, schema fields, and seed data (~30s, 3 VUs):

```bash
k6 run -e GRAPHQL_URL=http://<host>:<port>/v1/graphql k6/smoke.js
```

Optional: `-e SMOKE_VUS=5 -e SMOKE_DURATION=1m`.

Fix any setup errors before starting the breakpoint run.

## Latency (formerly expensive queries)

Light 1-VU check that home stats, search, and 24h aggregates stay under 1s.
Safe for local machines — not a stress test.

```bash
k6 run -e GRAPHQL_URL=http://localhost:4350/v1/graphql k6/latency.js
```

Optional: `-e LATENCY_MAX_MS=1000 -e LATENCY_DURATION=20s`.

## Breakpoint (find max concurrent users)

Ramps VUs: 50 → 100 → 200 → 400 → 800 → 1200, holding ~4 minutes per step. Aborts when:

- HTTP failure rate ≥ 1%, or
- GraphQL `{ errors }` rate ≥ 1%, or
- HTTP request duration p95 ≥ 2s

```bash
k6 run -e GRAPHQL_URL=http://<host>:<port>/v1/graphql k6/breakpoint.js
```

Optional env:

| Variable | Default | Meaning |
|----------|---------|---------|
| `THINK_TIME_MIN` | `2` | Min sleep between requests (seconds) |
| `THINK_TIME_MAX` | `3` | Max sleep between requests (seconds) |
| `HOLD_DURATION` | `4m` | Hold time at each VU level |
| `MAX_VUS` | `1200` | Cap / last VU target |
| `DURATION_P95_MS` | `2000` | Abort if HTTP duration p95 exceeds this (ms). Raise on high-RTT links (e.g. cellular). |

Example (shorter probe up to 200 VUs, 2m holds):

```bash
k6 run \
  -e GRAPHQL_URL=http://<host>:<port>/v1/graphql \
  -e MAX_VUS=200 \
  -e HOLD_DURATION=2m \
  k6/breakpoint.js
```

### Concurrent-user model

One **VU** ≈ one concurrent user with ~2–3s think time between GraphQL calls. Do not treat peak RPS alone as “concurrent users.”

### Query mix

Documents and filters are taken from `explorer/src/api` (same field selections, `EXCLUDE_REWARD_TRANSFERS`, limits 25 / 6 / 5). Weighted toward typical browsing across current explorer pages:

| Weight | Query | Explorer source |
|--------|-------|-----------------|
| ~14% | `GetRecentUnifiedTransactions` | landing txs |
| ~17% | `GetBlocks` / `GetBlocksLanding` | blocks page (limit 25) + landing (limit 6) |
| ~12% | `GetUnifiedTransactions` | transactions list + aggregate |
| ~8% | `GetAccountById` | account detail |
| ~8% | `GetAccountTransactions` | account activity (`GetUnifiedTransactions` + account where) |
| ~6% | `GetHomeChainStats` | home hero (chain_stats + last24h + daily rollups) |
| ~5% | `GetBlockById` | block detail |
| ~5% | tx detail mix | `GetExtrinsicByHash` / reversible `ByTxId` / `GetWormholeExtrinsicById` |
| ~3% | `SearchHex` / `SearchNumeric` / `SearchText` | header search (shape-routed; full hashes OK) |
| ~3% | `GetAccounts` | accounts list |
| ~3% | miner leaderboard | `GetMinerLeaderboard` / `GetMinerLeaderboardChart` |
| ~2% | `GetMinerRewards` | miner rewards list |
| ~2% | `GetErrorEvents` | errors list |
| ~2% | `GetHighSecuritySets` | high-security list |
| ~2% | multisig created | `GetMultisigCreated` / `GetMultisigById` |
| ~2% | multisig proposals | `GetMultisigProposals` / `GetMultisigProposalById` |
| ~2% | `GetStatus` | light chain status |
| ~4% | stats probes | tx / block / account / miner / error / HS / multisig stats |

`setup()` seeds accounts, block height/hash, extrinsic hashes, reversible `detail_id`s, multisig/proposal IDs, and wormhole IDs from recent rows.
## How to read the result

1. Note the **last VU stage that still passed** all thresholds — that is the current max concurrent capacity for this hardware/config.
2. From the K6 end-of-run summary, record `http_reqs` rate (RPS), `http_req_duration` p95/p99, and `graphql_errors` at abort.
3. If abort is immediate at a low VU count, check URL/auth/data first (re-run smoke).
4. Postgres `statement_timeout=5000` turns slow SQL into GraphQL errors — that still counts as capacity exhaustion.

## What to watch on the server during the run

Keep the **processor running** so reads compete with live writes.

| Signal | Where | Healthy | Problem |
|--------|--------|---------|---------|
| K6 thresholds | Terminal | Pass until high VUs | Abort early |
| Hasura CPU / memory | Host / container stats | Stable | Saturating with VU steps |
| Postgres connections | `pg_stat_activity` / max_connections | Headroom | Near max, waiting |
| Slow / timed-out queries | Hasura `query-log`, Postgres logs | Rare | Rising with load |
| Processor lag | Metrics on `:9090` (or `PUBLIC_PORT_METRICS`) | Stable | Lag grows under API load |
| Nginx 429s | Only if testing via nginx | Should be none after bypass | Limits still applied |

## Safety

- Run against **staging / prod-like** only with explicit approval for that environment.
- Do **not** commit staging hostnames or secrets; pass `GRAPHQL_URL` on the command line.
- If you changed nginx for the test, restore limits before leaving the session.
- Do not point these scripts at production by default.

## Files

| File | Role |
|------|------|
| `queries.js` | Shared GraphQL documents + weighted `pickQuery` |
| `smoke.js` | Low-VU sanity check |
| `latency.js` | 1-VU check that formerly slow queries stay &lt;1s |
| `breakpoint.js` | Ramp-to-failure capacity test |
| `README.md` | This runbook |
