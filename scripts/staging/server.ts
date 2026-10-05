import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { ANON_KEY, IDENTITIES, LOCAL, signJwt, verifyJwt, assertLocalUrl } from "./config";
import type { Database } from "./db";
import { createStagingStorage } from "./storage";

type Identity = (typeof IDENTITIES)[number];
type Session = { id: string; identity: Identity; current: string; previous?: string; revoked: boolean; created: number };
type Refresh = { session: Session; usedAt?: number };
class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new HttpError(413, "payload_too_large", "Maximum request size is 1 MiB");
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
  catch { throw new HttpError(400, "bad_json", "Invalid JSON body"); }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function user(identity: Identity) {
  return { id: identity.id, aud: "authenticated", role: "authenticated", email: identity.email,
    email_confirmed_at: "2026-10-05T00:00:00Z", confirmed_at: "2026-10-05T00:00:00Z",
    phone: "", created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"], role: identity.role, staging: true },
    user_metadata: { full_name: identity.name }, identities: [], is_anonymous: false };
}

export function createStagingServer(db: Database) {
  assertLocalUrl(LOCAL.restUrl);
  const sessions = new Map<string, Session>();
  const refreshTokens = new Map<string, Refresh>();
  const storage = createStagingStorage();

  function sessionResponse(session: Session) {
    const issued = Math.floor(Date.now() / 1000);
    return { access_token: signJwt({ iss: LOCAL.apiUrl + "/auth/v1", aud: "authenticated",
      sub: session.identity.id, role: "authenticated", email: session.identity.email, iat: issued,
      exp: issued + 3600, session_id: session.id, aal: "aal1", amr: [{ method: "password", timestamp: issued }],
      app_metadata: user(session.identity).app_metadata, user_metadata: user(session.identity).user_metadata,
      is_anonymous: false }), token_type: "bearer", expires_in: 3600, expires_at: issued + 3600,
      refresh_token: session.current, user: user(session.identity) };
  }

  async function revoke(session: Session) {
    session.revoked = true;
    await db.query("delete from auth.sessions where id=$1 and user_id=$2", [session.id, session.identity.id]);
  }

  function bearer(req: IncomingMessage) {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new HttpError(401, "bad_jwt", "Bearer token required");
    try { return { token, claims: verifyJwt(token) }; }
    catch { throw new HttpError(401, "bad_jwt", "Invalid or expired staging JWT"); }
  }

  function authenticated(req: IncomingMessage) {
    const { token, claims } = bearer(req);
    const identity = IDENTITIES.find((i) => i.id === claims.sub);
    if (claims.role !== "authenticated" || !identity) throw new HttpError(401, "bad_jwt", "User access token required");
    return { token, claims, identity };
  }

  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    try {
      const remote = req.socket.remoteAddress;
      if (!["127.0.0.1", "::ffff:127.0.0.1"].includes(remote || "") ||
          !["127.0.0.1:54341", "localhost:54341"].includes(req.headers.host || "")) {
        throw new HttpError(403, "local_only", "Only loopback requests and localhost Host headers are allowed");
      }
      const origin = req.headers.origin;
      if (origin) {
        let local = false;
        try { const parsed = new URL(origin); local = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname) && !parsed.username && !parsed.password; } catch { /* Reject malformed origins. */ }
        if (!local) throw new HttpError(403, "local_only", "Only local HTTP browser origins are allowed");
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "Origin");
        res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-upsert, cache-control, x-client-info, x-supabase-api-version, prefer, range, range-unit, accept-profile, content-profile, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version");
        res.setHeader("access-control-allow-methods", "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS");
        res.setHeader("access-control-expose-headers", "content-range, range-unit, preference-applied, location");
      }
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
      if (!req.url?.startsWith("/")) throw new HttpError(400, "invalid_path", "Relative request path required");
      const url = new URL(req.url, LOCAL.apiUrl);
      if (url.origin !== LOCAL.apiUrl) throw new HttpError(403, "local_only", "Invalid request target");
      if (url.pathname === "/health" && req.method === "GET") {
        const probe = await fetch(LOCAL.restUrl + "/", { method: "HEAD", signal: AbortSignal.timeout(3000), redirect: "error" });
        const ready = probe.ok;
        json(res, ready ? 200 : 503, { staging: true, database: LOCAL.database, postgrest: ready, anonKey: ANON_KEY });
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/storage/v1/object/sign/")) {
        await storage(req, res, url); return;
      }
      if (typeof req.headers.apikey !== "string" || !safeEqual(req.headers.apikey, ANON_KEY)) {
        throw new HttpError(401, "invalid_api_key", "Use the public test-only staging anon key");
      }
      if (url.pathname.startsWith("/storage/v1/")) { await storage(req, res, url); return; }
      if (url.pathname === "/auth/v1/token" && req.method === "POST") {
        const input = await body(req);
        const grant = url.searchParams.get("grant_type");
        if (grant === "password") {
          const identity = IDENTITIES.find((i) => i.email === String(input.email).trim().toLowerCase());
          if (!identity || !safeEqual(String(input.password), LOCAL.password)) throw new HttpError(400, "invalid_credentials", "Invalid login credentials");
          if (sessions.size >= 2000) throw new HttpError(429, "session_limit", "Restart the staging harness to clear synthetic sessions");
          const session: Session = { id: randomUUID(), identity, current: randomBytes(32).toString("base64url"), revoked: false, created: Date.now() };
          await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session.id, identity.id]);
          sessions.set(session.id, session);
          refreshTokens.set(session.current, { session });
          json(res, 200, sessionResponse(session)); return;
        }
        if (grant === "refresh_token") {
          const token = String(input.refresh_token);
          const entry = refreshTokens.get(token);
          if (!entry || entry.session.revoked) throw new HttpError(400, "refresh_token_not_found", "Invalid or revoked refresh token");
          const session = entry.session;
          if (entry.usedAt) {
            if (Date.now() - entry.usedAt <= 10000 || token === session.previous) { json(res, 200, sessionResponse(session)); return; }
            await revoke(session);
            throw new HttpError(400, "refresh_token_already_used", "Refresh reuse revoked this staging session");
          }
          entry.usedAt = Date.now();
          session.previous = token;
          session.current = randomBytes(32).toString("base64url");
          refreshTokens.set(session.current, { session });
          json(res, 200, sessionResponse(session)); return;
        }
        throw new HttpError(400, "unsupported_grant_type", "Only password and refresh_token grants are emulated");
      }
      if (url.pathname === "/auth/v1/user" && req.method === "GET") {
        json(res, 200, user(authenticated(req).identity)); return;
      }
      if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
        const { claims, identity } = authenticated(req);
        const scope = url.searchParams.get("scope") || "global";
        if (!["local", "global", "others"].includes(scope)) throw new HttpError(400, "invalid_scope", "Invalid signout scope");
        for (const session of sessions.values()) {
          if (session.identity.id === identity.id && (scope === "global" ||
            (scope === "local" && session.id === claims.session_id) || (scope === "others" && session.id !== claims.session_id))) await revoke(session);
        }
        res.writeHead(204); res.end(); return;
      }
      if (url.pathname === "/rest/v1" || url.pathname.startsWith("/rest/v1/")) {
        for (const name of ["accept-profile", "content-profile"]) {
          if (req.headers[name] && req.headers[name] !== "public") throw new HttpError(403, "private_schema", "Only the public REST schema is exposed");
        }
        const headers = new Headers();
        for (const key of ["accept", "content-type", "prefer", "range", "range-unit", "accept-profile", "content-profile", "if-match", "if-none-match"]) {
          const value = req.headers[key]; if (typeof value === "string") headers.set(key, value);
        }
        headers.set("authorization", `Bearer ${req.headers.authorization ? bearer(req).token : ANON_KEY}`);
        const target = new URL(LOCAL.restUrl);
        target.pathname = url.pathname.slice("/rest/v1".length) || "/";
        target.search = url.search;
        const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
        const upstream = await fetch(target, { method: req.method, headers,
          ...(hasBody ? { body: JSON.stringify(await body(req)) } : {}), redirect: "error", signal: AbortSignal.timeout(30000) });
        for (const name of ["content-type", "content-range", "range-unit", "preference-applied", "etag"]) {
          const value = upstream.headers.get(name); if (value) res.setHeader(name, value);
        }
        res.writeHead(upstream.status);
        res.end(req.method === "HEAD" ? undefined : Buffer.from(await upstream.arrayBuffer())); return;
      }
      throw new HttpError(404, "unsupported_endpoint", "This staging harness emulates auth, rest and bounded private photo storage only");
    } catch (error) {
      const known = error instanceof HttpError;
      if (!known) console.error("Staging request failed:", error instanceof Error ? error.message : "unknown error");
      if (!res.headersSent) json(res, known ? error.status : 503, { code: known ? error.status : 503,
        error_code: known ? error.code : "staging_unavailable", msg: known ? error.message : "Local staging dependency unavailable" });
      else res.end();
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  return server;
}
