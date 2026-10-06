import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { LOCAL, verifyJwt } from "./config";
import { connectDatabase } from "./db";

const BUCKET = "chetech-repair-files";
const MAX_FILE = 8388608;
const MAX_TOTAL = 64 * 1024 * 1024;
type ObjectFile = { id: string; bytes: Buffer; type: string; owner: string };
class StorageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function output(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function read(req: IncomingMessage, limit: number) {
  const length = Number(req.headers["content-length"]);
  if (length > limit) throw new StorageError(413, "Local upload exceeds 8 MiB limit");
  const chunks: Buffer[] = []; let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new StorageError(413, "Local upload exceeds size limit");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parsePath(bucket: string, raw: string) {
  if (bucket !== BUCKET) throw new StorageError(404, "Only the local repair photos bucket exists");
  let path: string;
  try { path = decodeURIComponent(raw); } catch { throw new StorageError(400, "Invalid object path"); }
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  if (!new RegExp(`^${uuid}/${uuid}/[a-zA-Z0-9_-]{1,100}\\.(jpg|jpeg|png|webp)$`).test(path)) {
    throw new StorageError(400, "Expected orderId/userId/random image path; traversal is forbidden");
  }
  return path;
}

async function authorize(req: IncomingMessage, path: string, write = false, cleanup = false) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  let claims: Record<string, unknown>;
  try { claims = verifyJwt(token || ""); } catch { throw new StorageError(401, "Valid staging user JWT required"); }
  if (claims.role !== "authenticated") throw new StorageError(401, "User token required");
  const [orderId, owner] = path.split("/");
  if (write && owner !== claims.sub) throw new StorageError(403, "Only the path's uploader may write or remove this object");
  // Use a separate connection so request-local claims never leak into auth/REST traffic.
  const db = await connectDatabase();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    await db.query("set local role authenticated");
    const allowed = await db.query("select private.can_access_operations() allowed");
    if (!allowed.rows[0].allowed) throw new StorageError(403, "Operations permission required");
    // Storage's operations policy allows technicians; their direct order SELECT
    // is intentionally hidden. Check existence only after the real role guard.
    await db.query("reset role");
    const order = await db.query("select id from public.repair_access_orders where id=$1", [orderId]);
    if (!order.rows.length) throw new StorageError(404, "Order not found or inaccessible");
    if (cleanup) {
      const exists = await db.query("select to_regclass('public.repair_order_attachments') present");
      if (exists.rows[0].present) {
        const linked = await db.query("select id from public.repair_order_attachments where object_path=$1", [path]);
        if (linked.rows.length) throw new StorageError(409, "Linked repair evidence cannot be removed");
      }
    }
    return String(claims.sub);
  } finally { await db.query("rollback"); await db.end(); }
}

function matchesImage(bytes: Buffer, type: string) {
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp") return bytes.length >= 12 && bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP";
  return false;
}

export function createStagingStorage() {
  const objects = new Map<string, ObjectFile>();
  let totalBytes = 0;
  function signature(payload: string) { return createHmac("sha256", LOCAL.jwtSecret).update("storage:" + payload).digest(); }

  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    try {
      const signed = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
      if (signed && req.method === "GET") {
        const path = parsePath(signed[1], signed[2]);
        const token = url.searchParams.get("token") || "";
        const [payload, mac, extra] = token.split(".");
        try {
          const actual = Buffer.from(mac || "", "base64url"), expected = signature(payload || "");
          if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
          const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
          if (claims.path !== path || claims.bucket !== BUCKET || !Number.isFinite(claims.expires) || claims.expires <= Date.now()) throw new Error();
        } catch { throw new StorageError(403, "Invalid or expired local signed URL"); }
        const file = objects.get(path);
        if (!file) throw new StorageError(404, "Object not found in local memory");
        res.writeHead(200, { "content-type": file.type, "content-length": file.bytes.length, "cache-control": "no-store",
          "content-disposition": "inline", "x-content-type-options": "nosniff" }); res.end(file.bytes); return;
      }
      if (signed && req.method === "POST") {
        const path = parsePath(signed[1], signed[2]);
        await authorize(req, path);
        if (!objects.has(path)) throw new StorageError(404, "Object not found in local memory");
        const input = JSON.parse((await read(req, 4096)).toString());
        if (!Number.isInteger(input.expiresIn) || input.expiresIn < 1 || input.expiresIn > 60 || input.transform) throw new StorageError(400, "Signed URL TTL must be 1-60 seconds; transforms are unsupported");
        const payload = Buffer.from(JSON.stringify({ bucket: BUCKET, path, expires: Date.now() + input.expiresIn * 1000 })).toString("base64url");
        output(res, 200, { signedURL: `/object/sign/${BUCKET}/${path}?token=${payload}.${signature(payload).toString("base64url")}` }); return;
      }
      const upload = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
      if (upload && req.method === "POST") {
        const path = parsePath(upload[1], upload[2]);
        const owner = await authorize(req, path, true);
        if (req.headers["x-upsert"] === "true" || objects.has(path)) throw new StorageError(409, "Local objects are immutable; choose a new path");
        if (objects.size >= 128) throw new StorageError(507, "Local object count limit reached");
        let bytes = await read(req, MAX_FILE + 65536);
        let type = String(req.headers["content-type"] || "").split(";")[0];
        if (type === "multipart/form-data") {
          const form = await new Response(new Uint8Array(bytes), { headers: { "content-type": req.headers["content-type"]! } }).formData();
          const files = [...form.values()].filter((value): value is File => typeof value !== "string");
          if (files.length !== 1) throw new StorageError(400, "Exactly one image per upload is required");
          type = files[0].type; bytes = Buffer.from(await files[0].arrayBuffer());
        }
        if (!bytes.length || bytes.length > MAX_FILE) throw new StorageError(413, "Image must contain 1-8388608 bytes");
        if (!matchesImage(bytes, type)) throw new StorageError(415, "Only JPEG, PNG, or WebP with matching magic bytes are accepted");
        if (totalBytes + bytes.length > MAX_TOTAL) throw new StorageError(507, "Local 64 MiB memory limit reached");
        // Recheck after async reads to avoid duplicate concurrent uploads at one path.
        if (objects.has(path)) throw new StorageError(409, "Object already exists");
        const file = { id: randomUUID(), bytes, type, owner };
        objects.set(path, file); totalBytes += bytes.length;
        output(res, 200, { Id: file.id, Key: `${BUCKET}/${path}` }); return;
      }
      const remove = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/);
      if (remove && req.method === "DELETE") {
        if (remove[1] !== BUCKET) throw new StorageError(404, "Unknown local bucket");
        const input = JSON.parse((await read(req, 16384)).toString());
        if (!Array.isArray(input.prefixes) || !input.prefixes.length || input.prefixes.length > 20) throw new StorageError(400, "Remove requires 1-20 exact object paths");
        const paths = input.prefixes.map((value: string) => parsePath(BUCKET, value));
        for (const path of paths) await authorize(req, path, true, true);
        const result = [];
        for (const path of paths) {
          const file = objects.get(path);
          if (file) { objects.delete(path); totalBytes -= file.bytes.length; result.push({ name: path, id: file.id, bucket_id: BUCKET }); }
        }
        output(res, 200, result); return;
      }
      throw new StorageError(404, "Unsupported local Storage mock endpoint");
    } catch (error) {
      const status = error instanceof StorageError ? error.status : 400;
      output(res, status, { statusCode: String(status), error: "LocalStorageError", message: error instanceof StorageError ? error.message : "Invalid local storage request" });
    }
  };
}
