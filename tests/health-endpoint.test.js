/* global process */
// NOTE ON FILE NAME / FRAMEWORK: this repo's only existing test convention is
// Playwright `tests/*.spec.js` (see home.spec.js, premium.spec.js), run via
// `npx playwright test` against a live dev server at localhost:5173 (no
// `webServer` is configured, so that command requires one running manually).
// A health-endpoint unit test needs to mock all network and run in
// isolation, with no browser and no dev server — the opposite of what those
// specs need. Playwright's own default `testMatch` (`**/*.@(spec|test).js`)
// would otherwise sweep this file into a full `npx playwright test` run and
// try to execute it as a browser test, which it is not. Node's built-in
// `node:test` (used here) needs no extra dependency, runs in full isolation
// via `node --test tests/health-endpoint.test.js`, and is the same pattern
// already used for this exact Fleet Health check in the sibling
// digital-lab-audit and microassist repos. Run the pre-existing Playwright
// suite separately and unmodified: `npx playwright test tests/home.spec.js
// tests/premium.spec.js`.
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import handler, { __test__ } from "../api/health.js";

const HEALTH_SOURCE = readFileSync(new URL("../api/health.js", import.meta.url), "utf8");

// api/ping.js must remain untouched by this LOT. Snapshotting its exact,
// known-good content here (captured before any change in this LOT) turns
// "existing api/ping.js untouched" into an automated assertion instead of a
// manual claim.
const PING_SOURCE_SNAPSHOT = `export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    project: "microassist-expert",
    time: new Date().toISOString(),
  });
}
`;

const FIX_URL = "https://microassist-expert-health-fixture.example.supabase.co";
const FIX_KEY = "test-anon-key-DO-NOT-LEAK-0000000000000000";

let realFetch;

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.headers["content-type"] = "application/json; charset=utf-8";
      this.body = JSON.stringify(obj);
      this.ended = true;
      return this;
    },
    end(data) {
      if (data !== undefined) this.body = data;
      this.ended = true;
      return this;
    },
  };
}

/**
 * behavior: "ok" (200) | "timeout" | "network" | <integer http status>
 * Returns the recorded outbound calls.
 */
function installFetch(behavior) {
  const calls = [];
  globalThis.fetch = (input, init = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: String(init.method || "GET").toUpperCase(),
      headers: { ...(init.headers || {}) },
    });
    if (behavior === "timeout") {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    if (behavior === "network") {
      return Promise.reject(new TypeError("fetch failed: ECONNREFUSED 10.0.0.1:443"));
    }
    const status = behavior === "ok" ? 200 : behavior;
    return Promise.resolve({ status, ok: status >= 200 && status < 300 });
  };
  return calls;
}

async function callGet() {
  const res = makeRes();
  await handler({ method: "GET" }, res);
  return { res, body: JSON.parse(res.body) };
}

function pick(body, key) {
  const c = body.checks.find((entry) => entry.key === key);
  return c ? { status: c.status, reason: c.reason } : undefined;
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  process.env.HEALTH_SUPABASE_URL = FIX_URL;
  process.env.HEALTH_SUPABASE_ANON_KEY = FIX_KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  delete process.env.HEALTH_SUPABASE_URL;
  delete process.env.HEALTH_SUPABASE_ANON_KEY;
});

// 1
test("all configured + healthy provider -> HEALTHY / HTTP 200", async () => {
  const calls = installFetch("ok");
  const { res, body } = await callGet();
  assert.equal(res.statusCode, 200);
  assert.equal(body.status, "HEALTHY");
  assert.equal(res.getHeader("cache-control"), "no-store");
  assert.equal(res.getHeader("retry-after"), undefined);
  assert.deepEqual(
    body.checks.map((c) => c.key),
    ["runtime", "configuration", "backend_platform", "backend_auth", "cloud_sync"],
  );
  assert.equal(calls.length, 1);
});

// 2a
test("missing HEALTH_SUPABASE_URL -> project DEGRADED (never DOWN), HTTP 200", async () => {
  delete process.env.HEALTH_SUPABASE_URL;
  installFetch("ok");
  const { res, body } = await callGet();
  assert.equal(body.status, "DEGRADED");
  assert.notEqual(body.status, "DOWN");
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader("retry-after"), undefined);
  assert.deepEqual(pick(body, "configuration"), { status: "NOT_CONFIGURED", reason: "config_missing" });
});

// 2b
test("missing HEALTH_SUPABASE_ANON_KEY -> project DEGRADED (never DOWN), HTTP 200", async () => {
  delete process.env.HEALTH_SUPABASE_ANON_KEY;
  installFetch("ok");
  const { res, body } = await callGet();
  assert.equal(body.status, "DEGRADED");
  assert.equal(res.statusCode, 200);
});

// 3
test("missing config fires zero fetch calls, and both dependency checks report config_missing", async () => {
  delete process.env.HEALTH_SUPABASE_URL;
  const calls = installFetch("ok");
  const { body } = await callGet();
  assert.equal(calls.length, 0);
  assert.deepEqual(pick(body, "backend_platform"), { status: "NOT_CONFIGURED", reason: "config_missing" });
  assert.deepEqual(pick(body, "backend_auth"), { status: "NOT_CONFIGURED", reason: "config_missing" });
});

// 4 + 5
test("platform request uses the apikey header, carries no Authorization bearer, and never exposes the key in the response", async () => {
  const calls = installFetch("ok");
  const { body } = await callGet();
  const call = calls[0];
  assert.equal(call.method, "GET");
  assert.match(call.url, /\/auth\/v1\/health$/);
  const headerKeys = Object.keys(call.headers).map((k) => k.toLowerCase());
  assert.ok(headerKeys.includes("apikey"));
  assert.equal(call.headers.apikey, FIX_KEY);
  assert.ok(!headerKeys.includes("authorization"));
  assert.equal(JSON.stringify(body).includes(FIX_KEY), false);
});

// 6 + 7
test("provider 200 -> backend_platform HEALTHY/backend_ok and backend_auth HEALTHY/auth_service_ok", async () => {
  installFetch(200);
  const { body } = await callGet();
  assert.deepEqual(pick(body, "backend_platform"), { status: "HEALTHY", reason: "backend_ok" });
  assert.deepEqual(pick(body, "backend_auth"), { status: "HEALTHY", reason: "auth_service_ok" });
  assert.equal(body.status, "HEALTHY");
});

// 8 + 9
test("provider 401 -> DEGRADED/backend_auth_failed on both derived checks (never UNKNOWN/unknown_error), project DEGRADED", async () => {
  installFetch(401);
  const { res, body } = await callGet();
  const platform = pick(body, "backend_platform");
  const auth = pick(body, "backend_auth");
  assert.deepEqual(platform, { status: "DEGRADED", reason: "backend_auth_failed" });
  assert.deepEqual(auth, { status: "DEGRADED", reason: "backend_auth_failed" });
  assert.notEqual(platform.status, "UNKNOWN");
  assert.notEqual(platform.reason, "unknown_error");
  assert.equal(body.status, "DEGRADED");
  assert.equal(res.statusCode, 200);
});

// 10
test("provider 404 -> backend_platform DOWN/backend_unreachable, but project DEGRADED (never DOWN), HTTP 200", async () => {
  installFetch(404);
  const { res, body } = await callGet();
  assert.deepEqual(pick(body, "backend_platform"), { status: "DOWN", reason: "backend_unreachable" });
  assert.deepEqual(pick(body, "backend_auth"), { status: "DOWN", reason: "auth_service_unavailable" });
  assert.equal(body.status, "DEGRADED");
  assert.notEqual(body.status, "DOWN");
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader("retry-after"), undefined);
});

// 11
test("provider 503 -> backend_platform DOWN/backend_unreachable, but project DEGRADED (never DOWN)", async () => {
  installFetch(503);
  const { res, body } = await callGet();
  assert.deepEqual(pick(body, "backend_platform"), { status: "DOWN", reason: "backend_unreachable" });
  assert.equal(body.status, "DEGRADED");
  assert.equal(res.statusCode, 200);
});

// 12
test("timeout -> backend_platform UNKNOWN/probe_timeout, but project DEGRADED (never DOWN), HTTP 200", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  installFetch("timeout");
  const res = makeRes();
  const pending = handler({ method: "GET" }, res);
  mock.timers.tick(__test__.PROBE_TIMEOUT_MS + 100);
  await pending;
  const body = JSON.parse(res.body);
  assert.deepEqual(pick(body, "backend_platform"), { status: "UNKNOWN", reason: "probe_timeout" });
  assert.deepEqual(pick(body, "backend_auth"), { status: "UNKNOWN", reason: "probe_timeout" });
  assert.equal(body.status, "DEGRADED");
  assert.equal(res.statusCode, 200);
});

// 13
test("network failure -> backend_platform DOWN/backend_unreachable, but project DEGRADED (never DOWN)", async () => {
  installFetch("network");
  const { res, body } = await callGet();
  assert.deepEqual(pick(body, "backend_platform"), { status: "DOWN", reason: "backend_unreachable" });
  assert.deepEqual(pick(body, "backend_auth"), { status: "DOWN", reason: "auth_service_unavailable" });
  assert.equal(body.status, "DEGRADED");
  assert.equal(res.statusCode, 200);
});

// 14
test("backend_auth is derived from the SAME probe — exactly one provider request total", async () => {
  const calls = installFetch(200);
  await callGet();
  assert.equal(calls.length, 1);
  const outcome = { kind: "response", status: 200 };
  assert.deepEqual(__test__.mapAuth(outcome), { status: "HEALTHY", reason: "auth_service_ok" });
  assert.deepEqual(__test__.mapPlatform(outcome), { status: "HEALTHY", reason: "backend_ok" });
});

// 15
test("cloud_sync is optional / NOT_CONFIGURED / dependency_not_configured, and issues no provider call", async () => {
  const calls = installFetch("ok");
  const { body } = await callGet();
  assert.deepEqual(
    body.checks.find((c) => c.key === "cloud_sync"),
    { key: "cloud_sync", layer: "functional", required: "optional", status: "NOT_CONFIGURED", reason: "dependency_not_configured" },
  );
  // still exactly the one /auth/v1/health call — cloud_sync never probes anything.
  assert.equal(calls.length, 1);
});

// 16
test("cloud_sync NOT_CONFIGURED does not drag a healthy configured project away from HEALTHY", async () => {
  installFetch(200);
  const { body } = await callGet();
  assert.equal(body.checks.find((c) => c.key === "cloud_sync").status, "NOT_CONFIGURED");
  assert.equal(body.status, "HEALTHY");
});

// 17
test("runtime is always HEALTHY/runtime_ok regardless of Supabase state (a true runtime failure can't be produced from a successful invocation)", async () => {
  for (const behavior of ["ok", 401, 404, "network"]) {
    installFetch(behavior);
    const { body } = await callGet();
    assert.deepEqual(pick(body, "runtime"), { status: "HEALTHY", reason: "runtime_ok" });
  }
  delete process.env.HEALTH_SUPABASE_URL;
  const { body: bodyNoConfig } = await callGet();
  assert.deepEqual(pick(bodyNoConfig, "runtime"), { status: "HEALTHY", reason: "runtime_ok" });
});

// 18
test("response contains no env values, key, provider URL, or project ref", async () => {
  installFetch("ok");
  const { body } = await callGet();
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    FIX_URL,
    FIX_KEY,
    "supabase.co",
    "microassist-expert-health-fixture",
    "hajitswgofjqedcveqxe",
    "auth/v1",
    "rest/v1",
    "apikey",
    "Bearer ",
    "HEALTH_SUPABASE",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leak: ${forbidden}`);
  }
});

// 19
test("no raw exception text on the failure path", async () => {
  installFetch("network");
  const { body } = await callGet();
  const serialized = JSON.stringify(body);
  for (const fragment of ["fetch failed", "ECONNREFUSED", "TypeError", "AbortError", "stack", "    at ", "10.0.0.1"]) {
    assert.equal(serialized.includes(fragment), false, `leak: ${fragment}`);
  }
});

// 20
test("only GET provider traffic (no write verbs)", async () => {
  const calls = installFetch("ok");
  await callGet();
  for (const call of calls) {
    assert.equal(call.method, "GET");
  }
  for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(calls.some((c) => c.method === verb), false);
  }
});

// 21 + 22
test("health module imports nothing, writes nothing, and references no app / business / write API", () => {
  const specifiers = [...HEALTH_SOURCE.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(specifiers, []); // zero imports
  assert.equal(/\brequire\s*\(/.test(HEALTH_SOURCE), false); // no CJS require either
  for (const forbidden of [
    "src/",
    "../src",
    "@supabase/supabase-js",
    "createClient",
    "supabase/functions",
    "writeFileSync",
    "writeFile(",
    "child_process",
    "node:fs",
    ".insert(",
    ".update(",
    ".upsert(",
    ".delete(",
    ".rpc(",
  ]) {
    assert.equal(HEALTH_SOURCE.includes(forbidden), false, `forbidden token: ${forbidden}`);
  }
});

// 23 + 24
test("schema_version is exactly \"1\" and project_id is exactly \"microassist-expert\"", async () => {
  installFetch("ok");
  const { body } = await callGet();
  assert.equal(body.schema_version, "1");
  assert.equal(body.project_id, "microassist-expert");
  assert.deepEqual(Object.keys(body).sort(), ["checks", "generated_at", "project_id", "schema_version", "status"]);
});

// 25
test("generated_at is a valid ISO-8601 UTC timestamp", async () => {
  installFetch("ok");
  const { body } = await callGet();
  assert.equal(typeof body.generated_at, "string");
  assert.equal(new Date(body.generated_at).toISOString(), body.generated_at);
});

// 26
test("every check uses only the closed status / layer / required / reason vocabulary", async () => {
  installFetch(500); // exercise a failure branch too
  const { body } = await callGet();
  const statuses = new Set(["HEALTHY", "DEGRADED", "DOWN", "UNKNOWN", "NOT_CONFIGURED"]);
  const layers = new Set(["endpoint", "dependency", "functional"]);
  const requireds = new Set(["critical", "degradable", "optional"]);
  const reasons = new Set([
    "runtime_ok",
    "config_ok",
    "config_missing",
    "backend_ok",
    "backend_unreachable",
    "backend_auth_failed",
    "auth_service_ok",
    "auth_service_unavailable",
    "dependency_not_configured",
    "probe_timeout",
    "unknown_error",
  ]);
  assert.ok(statuses.has(body.status));
  for (const c of body.checks) {
    assert.equal(typeof c.key, "string");
    assert.ok(layers.has(c.layer), `layer ${c.layer}`);
    assert.ok(requireds.has(c.required), `required ${c.required}`);
    assert.ok(statuses.has(c.status), `status ${c.status}`);
    assert.ok(reasons.has(c.reason), `reason ${c.reason}`);
  }
});

// extra: unexpected HTTP status maps to UNKNOWN/unknown_error (not a silent HEALTHY), still DEGRADED overall
test("unexpected provider HTTP 418 -> backend_platform UNKNOWN/unknown_error -> project DEGRADED", async () => {
  installFetch(418);
  const { res, body } = await callGet();
  assert.deepEqual(pick(body, "backend_platform"), { status: "UNKNOWN", reason: "unknown_error" });
  assert.equal(body.status, "DEGRADED");
  assert.equal(res.statusCode, 200);
});

// extra: GET/HEAD contract
test("HEAD returns status + headers and an empty body; unsupported methods -> 405 with Allow", async () => {
  installFetch("ok");
  const headRes = makeRes();
  await handler({ method: "HEAD" }, headRes);
  assert.equal(headRes.statusCode, 200);
  assert.equal(headRes.getHeader("cache-control"), "no-store");
  assert.equal(headRes.body, undefined);

  const postRes = makeRes();
  await handler({ method: "POST" }, postRes);
  assert.equal(postRes.statusCode, 405);
  assert.equal(postRes.getHeader("allow"), "GET, HEAD");
  assert.equal(postRes.getHeader("cache-control"), "no-store");
});

// 27
test("existing api/ping.js is untouched by this LOT", () => {
  const pingSource = readFileSync(new URL("../api/ping.js", import.meta.url), "utf8");
  // Compare content only; line-ending convention (CRLF vs LF) and a trailing
  // newline are checkout/editor details (git autocrlf), not content changes.
  const normalize = (s) => s.replace(/\r\n/g, "\n").replace(/\n$/, "");
  assert.equal(normalize(pingSource), normalize(PING_SOURCE_SNAPSHOT));
});
