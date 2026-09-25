/**
 * Breakpoint test: ramp concurrent users until Hasura + Postgres fail thresholds.
 * Hit Hasura directly (/v1/graphql) to bypass nginx per-IP limits.
 * Query mix mirrors explorer/src/api traffic.
 *
 * Usage:
 *   k6 run -e GRAPHQL_URL=http://<host>:<BLUE_or_GREEN_GQL_PORT>/v1/graphql k6/breakpoint.js
 *
 * Optional env:
 *   THINK_TIME_MIN / THINK_TIME_MAX  (seconds, default 2 / 3)
 *   HOLD_DURATION                    (per stage hold, default 4m)
 *   MAX_VUS                          (cap, default 1200)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SEED_FIXTURES, fixturesFromSeed, pickQuery } from './queries.js';

const GRAPHQL_URL = __ENV.GRAPHQL_URL;
if (!GRAPHQL_URL) {
  throw new Error('GRAPHQL_URL is required, e.g. -e GRAPHQL_URL=http://host:port/v1/graphql');
}

const THINK_TIME_MIN = Number(__ENV.THINK_TIME_MIN || 2);
const THINK_TIME_MAX = Number(__ENV.THINK_TIME_MAX || 3);
const HOLD = __ENV.HOLD_DURATION || '4m';
const MAX_VUS = Number(__ENV.MAX_VUS || 1200);
/** p95 abort threshold in ms. Raise on high-RTT networks (e.g. cellular). */
const DURATION_P95_MS = Number(__ENV.DURATION_P95_MS || 2000);

const graphqlErrors = new Rate('graphql_errors');
const graphqlDuration = new Trend('graphql_duration', true);

function stages() {
  const targets = [50, 100, 200, 400, 800, 1200].filter((t) => t <= MAX_VUS);
  if (targets.length === 0 || targets[targets.length - 1] !== MAX_VUS) {
    targets.push(MAX_VUS);
  }
  const out = [{ duration: '1m', target: targets[0] }];
  for (let i = 0; i < targets.length; i++) {
    out.push({ duration: HOLD, target: targets[i] });
    if (i + 1 < targets.length) {
      out.push({ duration: '1m', target: targets[i + 1] });
    }
  }
  out.push({ duration: '2m', target: 0 });
  return out;
}

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stages(),
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: [
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' },
    ],
    graphql_errors: [
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' },
    ],
    http_req_duration: [
      {
        threshold: `p(95)<${DURATION_P95_MS}`,
        abortOnFail: true,
        delayAbortEval: '30s',
      },
    ],
  },
};

function postGraphql(query, variables, name) {
  const res = http.post(
    GRAPHQL_URL,
    JSON.stringify({ query, variables }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name },
    }
  );
  let body = {};
  try {
    body = res.json();
  } catch (_) {
    body = {};
  }
  const hasErrors = !!body.errors;
  graphqlErrors.add(hasErrors ? 1 : 0);
  graphqlDuration.add(res.timings.duration, { name });
  return { res, body, hasErrors };
}

export function setup() {
  const { res, body, hasErrors } = postGraphql(SEED_FIXTURES, { limit: 100 }, 'SeedFixtures');

  if (res.status !== 200 || hasErrors) {
    throw new Error(
      `Breakpoint setup failed: status=${res.status} errors=${JSON.stringify(body.errors)} body=${String(res.body).slice(0, 500)}`
    );
  }

  const fixtures = fixturesFromSeed(body);
  if (fixtures.accounts.length === 0) {
    console.warn(
      'WARNING: no account IDs seeded; account queries may return empty sets'
    );
  }

  console.log(
    `Seeded accounts=${fixtures.accounts.length} blocks=${fixtures.blocks.length} hashes=${fixtures.hashes.length} ` +
      `scheduled=${fixtures.scheduledTxIds.length} executed=${fixtures.executedTxIds.length} cancelled=${fixtures.cancelledTxIds.length} ` +
      `multisigs=${fixtures.multisigIds.length} proposals=${fixtures.proposalIds.length} wormholes=${fixtures.wormholeIds.length}`
  );
  return fixtures;
}

export default function (data) {
  const { name, query, variables } = pickQuery(data);
  const { res, hasErrors } = postGraphql(query, variables, name);

  check(res, {
    'status 200': (r) => r.status === 200,
    'no graphql errors': () => !hasErrors,
  });

  const span = Math.max(0, THINK_TIME_MAX - THINK_TIME_MIN);
  sleep(THINK_TIME_MIN + Math.random() * span);
}
