/* global process */
/**
 * Fleet Health Endpoint Standard V1 — microassist-expert. GET /api/health
 *
 * Additive endpoint. Does not modify or replace `api/ping.js`, which keeps
 * its existing role as a simple Vercel liveness probe. Read-only. Imports
 * nothing from the application: no React code, no business-domain logic, no
 * localStorage model, no Supabase migration, no Edge Function, no
 * background scheduler. It never writes and never runs a business workflow.
 *
 * It issues at most one bounded outbound probe:
 *   GET {HEALTH_SUPABASE_URL}/auth/v1/health   with an `apikey` header
 *
 * Per the AI OS Fleet Supabase probe standard (Digital-Lab-AI-OS 92cbd45):
 * /auth/v1/health is NOT keyless — an unauthenticated request returns 401,
 * which maps to DEGRADED/backend_auth_failed (never HEALTHY, never
 * unknown_error). No `Authorization: Bearer` is sent for this probe.
 *
 * Expert-specific roll-up (intentionally different from microassist): Expert
 * is localStorage-first and cloud sync is an optional enhancement, so
 * `configuration`, `backend_platform` and `backend_auth` are all
 * `degradable` — Supabase being absent, misconfigured, or unreachable
 * degrades the project to DEGRADED but never takes it DOWN, because the
 * core prototype/localStorage path remains fully usable. Only a runtime
 * failure would produce DOWN; that state is part of the closed vocabulary
 * for standard compliance but is not reachable from a successfully
 * executing handler (see rollUp() below).
 *
 * The response body carries only closed-vocabulary statuses: no secrets, no
 * env values, no URLs, no project ref, no rows, no stack traces.
 */

const SCHEMA_VERSION = "1";
const PROJECT_ID = "microassist-expert";
const PROBE_TIMEOUT_MS = 2500;

function normalizeBaseUrl(raw) {
  return String(raw).trim().replace(/\/+$/, "");
}

async function probe(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return { kind: "response", status: response.status };
  } catch {
    // The underlying error is never captured, logged, or surfaced.
    return controller.signal.aborted ? { kind: "timeout" } : { kind: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Platform reachability, from GET /auth/v1/health (sent with the `apikey`
 * header only — no bearer token).
 */
function mapPlatform(outcome) {
  if (outcome.kind === "timeout") return { status: "UNKNOWN", reason: "probe_timeout" };
  if (outcome.kind === "network_error") return { status: "DOWN", reason: "backend_unreachable" };
  const code = outcome.status;
  if (code === 200 || code === 206) return { status: "HEALTHY", reason: "backend_ok" };
  if (code === 401) return { status: "DEGRADED", reason: "backend_auth_failed" };
  if (code === 404 || code >= 500) return { status: "DOWN", reason: "backend_unreachable" };
  return { status: "UNKNOWN", reason: "unknown_error" };
}

/**
 * Auth-service health, derived deterministically from the SAME
 * /auth/v1/health observation — that path IS GoTrue's own health endpoint,
 * so a second provider call would be redundant.
 */
function mapAuth(outcome) {
  if (outcome.kind === "timeout") return { status: "UNKNOWN", reason: "probe_timeout" };
  if (outcome.kind === "network_error") return { status: "DOWN", reason: "auth_service_unavailable" };
  const code = outcome.status;
  if (code === 200 || code === 206) return { status: "HEALTHY", reason: "auth_service_ok" };
  if (code === 401) return { status: "DEGRADED", reason: "backend_auth_failed" };
  if (code === 404 || code >= 500) return { status: "DOWN", reason: "auth_service_unavailable" };
  return { status: "UNKNOWN", reason: "unknown_error" };
}

/**
 * Expert roll-up. Every Supabase-derived check is `degradable`: cloud sync
 * is an optional layer over the localStorage-first core, so Supabase being
 * absent, misconfigured, or unreachable degrades the project — it never
 * takes it down. Only a runtime failure (the handler failing to execute at
 * all, which by construction can't be observed from inside a response this
 * function successfully returns) would produce DOWN.
 */
function rollUp(checks) {
  const runtime = checks.find((c) => c.key === "runtime");
  if (runtime.status !== "HEALTHY") return "DOWN";

  const configuration = checks.find((c) => c.key === "configuration");
  if (configuration.status === "NOT_CONFIGURED") return "DEGRADED";

  const platform = checks.find((c) => c.key === "backend_platform");
  const auth = checks.find((c) => c.key === "backend_auth");
  if (platform.status === "HEALTHY" && auth.status === "HEALTHY") return "HEALTHY";
  // Supabase DOWN, UNKNOWN, or auth DEGRADED all degrade the project — never DOWN.
  return "DEGRADED";
}

function httpStatusFor(status) {
  // NOT_CONFIGURED and DOWN are part of the shared Fleet-standard closed
  // vocabulary but are not reachable from Expert's rollUp() above — kept
  // here only for interface parity with the shared standard.
  if (status === "NOT_CONFIGURED") return { code: 503, retryAfter: 300 };
  if (status === "DOWN") return { code: 503, retryAfter: 60 };
  return { code: 200 };
}

async function computeHealth() {
  const generatedAt = new Date().toISOString();
  const checks = [
    { key: "runtime", layer: "endpoint", required: "critical", status: "HEALTHY", reason: "runtime_ok" },
  ];

  const supabaseUrl = (process.env.HEALTH_SUPABASE_URL || "").trim();
  const anonKey = (process.env.HEALTH_SUPABASE_ANON_KEY || "").trim();
  const configOk = supabaseUrl !== "" && anonKey !== "";

  checks.push({
    key: "configuration",
    layer: "endpoint",
    required: "degradable",
    status: configOk ? "HEALTHY" : "NOT_CONFIGURED",
    reason: configOk ? "config_ok" : "config_missing",
  });

  if (!configOk) {
    for (const key of ["backend_platform", "backend_auth"]) {
      checks.push({
        key,
        layer: "dependency",
        required: "degradable",
        status: "NOT_CONFIGURED",
        reason: "config_missing",
      });
    }
  } else {
    const outcome = await probe(`${normalizeBaseUrl(supabaseUrl)}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: anonKey },
    });
    const platform = mapPlatform(outcome);
    checks.push({
      key: "backend_platform",
      layer: "dependency",
      required: "degradable",
      status: platform.status,
      reason: platform.reason,
    });
    const auth = mapAuth(outcome);
    checks.push({
      key: "backend_auth",
      layer: "dependency",
      required: "degradable",
      status: auth.status,
      reason: auth.reason,
    });
  }

  // Phase 1: no safe probe target for cloud sync itself (a real check would
  // mean either a customer-data read or a dedicated health-only table, both
  // forbidden). Reported NOT_CONFIGURED and excluded from the roll-up so it
  // never drags a healthy project away from HEALTHY.
  checks.push({
    key: "cloud_sync",
    layer: "functional",
    required: "optional",
    status: "NOT_CONFIGURED",
    reason: "dependency_not_configured",
  });

  const status = rollUp(checks);
  const { code, retryAfter } = httpStatusFor(status);
  const headers = { "Cache-Control": "no-store" };
  if (retryAfter !== undefined) headers["Retry-After"] = String(retryAfter);

  return {
    body: { schema_version: SCHEMA_VERSION, project_id: PROJECT_ID, status, generated_at: generatedAt, checks },
    code,
    headers,
  };
}

export default async function handler(req, res) {
  const method = String(req && req.method ? req.method : "GET").toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Cache-Control", "no-store");
    res.status(405).end();
    return;
  }

  const { body, code, headers } = await computeHealth();
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);

  if (method === "HEAD") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(code).end();
    return;
  }
  res.status(code).json(body);
}

// Exported for deterministic unit tests only (no side effects on import).
export const __test__ = { computeHealth, rollUp, mapPlatform, mapAuth, normalizeBaseUrl, PROBE_TIMEOUT_MS };
