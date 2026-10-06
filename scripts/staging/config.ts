import { createHmac, timingSafeEqual } from "node:crypto";

// Deliberately public TEST-ONLY values. Never import this module into the app.
export const LOCAL = {
  database: "chetech_staging", databaseContainer: "chetech-staging-20261005",
  databaseUrl: "postgresql://postgres:chetech-local-test-20261005@127.0.0.1:54339/chetech_staging",
  databasePassword: "chetech-local-test-20261005",
  restContainer: "chetech-staging-postgrest-20261005", network: "chetech-staging-20261005",
  edgeNetwork: "chetech-staging-loopback-20261005",
  image: "postgrest/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df",
  apiUrl: "http://127.0.0.1:54341", restUrl: "http://127.0.0.1:54340",
  jwtSecret: "CHETECH-LOCAL-ONLY-20261005-NOT-A-PRODUCTION-SECRET",
  authenticator: "chetech_staging_authenticator", authenticatorPassword: "chetech-local-rest-only-20261005",
  fixtureTag: "CHETECH-STAGING-20261005", password: "Chetech-staging-only-20261005!"
} as const;

export const IDENTITIES = [
  { id: "c5100500-0000-4000-8000-000000000001", email: "admin@staging.invalid", role: "admin", name: "STAGING Admin" },
  { id: "c5100500-0000-4000-8000-000000000002", email: "tech@staging.invalid", role: "tecnico", name: "STAGING Tecnico" }
] as const;

export function assertLocalUrl(value: string, kind: "api" | "database" = "api") {
  const url = new URL(value);
  if (url.hostname !== "127.0.0.1" || url.search || url.hash ||
      (kind === "api" && (url.protocol !== "http:" || url.username || url.password)) ||
      (kind === "database" && (url.protocol !== "postgresql:" || url.port !== "54339" || url.pathname !== "/chetech_staging"))) {
    throw new Error("Only the explicitly isolated 127.0.0.1 staging endpoints are allowed");
  }
  return url;
}

export function signJwt(claims: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", LOCAL.jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyJwt(token: string): Record<string, unknown> {
  try {
    const [header, payload, signature, extra] = token.split(".");
    if (!header || !payload || !signature || extra || token.length > 8192) throw new Error();
    const meta = JSON.parse(Buffer.from(header, "base64url").toString());
    if (meta.alg !== "HS256" || meta.typ !== "JWT") throw new Error();
    const actual = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", LOCAL.jwtSecret).update(`${header}.${payload}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (!claims || claims.iss !== LOCAL.apiUrl + "/auth/v1" || !Number.isFinite(claims.exp) ||
        claims.exp <= now || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
        !["anon", "authenticated"].includes(claims.role) || claims.aud !== "authenticated") throw new Error();
    if (claims.role === "authenticated" && (!IDENTITIES.some((u) => u.id === claims.sub) ||
        typeof claims.session_id !== "string" || !/^[0-9a-f-]{36}$/.test(claims.session_id))) throw new Error();
    return claims;
  } catch {
    throw new Error("Invalid or expired staging JWT");
  }
}

export const ANON_KEY = signJwt({ iss: LOCAL.apiUrl + "/auth/v1", aud: "authenticated", role: "anon", iat: 1791200000, exp: 2100000000 });

export function nextEnvironment() {
  return { NEXT_PUBLIC_SUPABASE_URL: LOCAL.apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_URL: LOCAL.apiUrl, DATABASE_URL: LOCAL.databaseUrl, SUPABASE_DB_URL: LOCAL.databaseUrl,
    AFIP_ENVIRONMENT: "disabled", AFIP_CERTIFICATE: "", AFIP_PRIVATE_KEY: "",
    ARCA_ENVIRONMENT: "disabled", ARCA_PRODUCTION_ENABLED: "false",
    ARCA_ISSUER_CUIT: "", ARCA_TICKET_ENCRYPTION_KEY: "",
    ARCA_PROD_CERTIFICATE_PATH: "", ARCA_PROD_PRIVATE_KEY_PATH: "",
    ARCA_PROD_CERTIFICATE_PEM: "", ARCA_PROD_PRIVATE_KEY_PEM: "",
    ARCA_HOMO_CERTIFICATE_PATH: "", ARCA_HOMO_PRIVATE_KEY_PATH: "",
    ARCA_HOMO_CERTIFICATE_PEM: "", ARCA_HOMO_PRIVATE_KEY_PEM: "",
    ARCA_PROD_POINT_OF_SALE: "", ARCA_HOMO_POINT_OF_SALE: "",
    ARCA_PROD_WS_POINT_OF_SALE_VERIFIED: "false", ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: "false",
    ARCA_ISSUER_NAME: "", ARCA_ISSUER_ADDRESS: "", ARCA_ISSUER_GROSS_INCOME: "", ARCA_ISSUER_ACTIVITY_START: "" };
}
