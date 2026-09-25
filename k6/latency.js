/**
 * Latency check: 1 VU against formerly expensive GraphQL queries.
 * Asserts each request stays under 1s (p95) — not a capacity / stress test.
 *
 * Usage:
 *   k6 run -e GRAPHQL_URL=http://localhost:4350/v1/graphql k6/latency.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  SEED_FIXTURES,
  fixturesFromSeed,
  latencyProbes,
} from './queries.js';

const GRAPHQL_URL = __ENV.GRAPHQL_URL;
if (!GRAPHQL_URL) {
  throw new Error('GRAPHQL_URL is required, e.g. -e GRAPHQL_URL=http://localhost:4350/v1/graphql');
}

const MAX_MS = Number(__ENV.LATENCY_MAX_MS || 1000);
const graphqlErrors = new Rate('graphql_errors');
const queryDuration = new Trend('query_duration', true);

export const options = {
  vus: 1,
  duration: __ENV.LATENCY_DURATION || '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    graphql_errors: ['rate<0.01'],
    http_req_duration: [`p(95)<${MAX_MS}`],
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
  queryDuration.add(res.timings.duration, { name });
  return { res, body, hasErrors };
}

export function setup() {
  const { res, body, hasErrors } = postGraphql(SEED_FIXTURES, { limit: 50 }, 'SeedFixtures');

  if (res.status !== 200 || hasErrors) {
    throw new Error(
      `Latency setup failed: status=${res.status} errors=${JSON.stringify(body.errors)}`
    );
  }

  const fixtures = fixturesFromSeed(body);
  if (fixtures.accounts.length === 0) {
    throw new Error('Latency setup: no account IDs found');
  }

  const probes = latencyProbes(fixtures);
  console.log(`Latency probes (${probes.length}): ${probes.map((p) => p.name).join(', ')}`);
  console.log(`Threshold: p95 < ${MAX_MS}ms (1 VU)`);

  // Warm + print one-shot timings so the summary is easy to read.
  for (const probe of probes) {
    const result = postGraphql(probe.query, probe.variables, probe.name);
    const ms = result.res.timings.duration;
    const ok = result.res.status === 200 && !result.hasErrors && ms < MAX_MS;
    console.log(
      `${ok ? 'OK' : 'FAIL'} ${probe.name}: ${ms.toFixed(0)}ms` +
        (result.hasErrors ? ` errors=${JSON.stringify(result.body.errors)}` : '')
    );
    if (result.res.status !== 200 || result.hasErrors) {
      throw new Error(`Latency probe ${probe.name} failed in setup`);
    }
  }

  return { fixtures, probes };
}

export default function (data) {
  for (const probe of data.probes) {
    const { res, hasErrors } = postGraphql(probe.query, probe.variables, probe.name);
    check(res, {
      'status 200': (r) => r.status === 200,
      'no graphql errors': () => !hasErrors,
      [`under ${MAX_MS}ms`]: (r) => r.timings.duration < MAX_MS,
    });
  }
  sleep(0.5);
}
