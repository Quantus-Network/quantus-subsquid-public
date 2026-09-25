/**
 * Smoke test: 1–5 VUs against staging Hasura.
 * Confirms URL, explorer query shapes, and public-role auth before a breakpoint run.
 *
 * Usage:
 *   k6 run -e GRAPHQL_URL=http://<host>:<port>/v1/graphql k6/smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import {
  SEED_FIXTURES,
  fixturesFromSeed,
  pickQuery,
  smokeProbes,
} from './queries.js';

const GRAPHQL_URL = __ENV.GRAPHQL_URL;
if (!GRAPHQL_URL) {
  throw new Error('GRAPHQL_URL is required, e.g. -e GRAPHQL_URL=http://host:port/v1/graphql');
}

const graphqlErrors = new Rate('graphql_errors');

export const options = {
  vus: Number(__ENV.SMOKE_VUS || 3),
  duration: __ENV.SMOKE_DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    graphql_errors: ['rate<0.01'],
    checks: ['rate>0.99'],
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
  return { res, body, hasErrors };
}

export function setup() {
  const { res, body, hasErrors } = postGraphql(SEED_FIXTURES, { limit: 50 }, 'SeedFixtures');

  const ok = check(res, {
    'seed status 200': (r) => r.status === 200,
    'seed no graphql errors': () => !hasErrors,
    'seed has rows': () =>
      Array.isArray(body.data?.transactions) && body.data.transactions.length > 0,
  });

  if (!ok) {
    throw new Error(
      `Smoke setup failed: status=${res.status} body=${res.body?.slice?.(0, 500) || res.body}`
    );
  }

  const fixtures = fixturesFromSeed(body);
  if (fixtures.accounts.length === 0) {
    throw new Error('Smoke setup: no account IDs found in unified_transaction');
  }

  for (const probe of smokeProbes(fixtures)) {
    const result = postGraphql(probe.query, probe.variables, `setup_${probe.name}`);
    check(result.res, {
      [`${probe.name} status 200`]: (r) => r.status === 200,
      [`${probe.name} no graphql errors`]: () => !result.hasErrors,
      [`${probe.name} has data`]: () => !!result.body.data,
    });
    if (result.hasErrors || result.res.status !== 200) {
      throw new Error(
        `Smoke setup query ${probe.name} failed: status=${result.res.status} errors=${JSON.stringify(result.body.errors)}`
      );
    }
  }

  return fixtures;
}

export default function (data) {
  const { name, query, variables } = pickQuery(data);
  const { res, hasErrors } = postGraphql(query, variables, name);

  check(res, {
    'status 200': (r) => r.status === 200,
    'no graphql errors': () => !hasErrors,
  });

  sleep(1);
}
