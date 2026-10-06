import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decryptTicket, encryptTicket, parseTicketEncryptionKey, type AccessTicket, type SealedTicket, type TicketKey } from "./ticket-crypto";
import { getSharedAccessTicket, type TicketCacheRepository } from "./ticket-cache";

const key: TicketKey = { environment: "homologation", cuit: "20123456786", fingerprint: "a".repeat(64), service: "wsfe" };
const secret = Buffer.alloc(32, 7).toString("base64");
const now = Date.parse("2026-10-05T15:00:00Z");
const ticket: AccessTicket = { token: "synthetic-private-token", sign: "synthetic-private-sign", expires: now + 43200000 };

function memoryRepository() {
  const rows = new Map<string, { lease?: string; sealed?: SealedTicket }>();
  const repository: TicketCacheRepository = {
    async claim(scope) {
      const id = JSON.stringify(scope), row = rows.get(id);
      if (row?.sealed && row.sealed.expires > now + 120000) return { kind: "cached", ...row.sealed };
      if (row?.lease) return { kind: "busy" };
      const lease = randomUUID(); rows.set(id, { lease });
      return { kind: "acquired", token: lease };
    },
    async publish(scope, lease, sealed) {
      const id = JSON.stringify(scope);
      if (rows.get(id)?.lease !== lease) return false;
      rows.set(id, { sealed }); return true;
    },
    async release(scope, lease) {
      const id = JSON.stringify(scope);
      if (rows.get(id)?.lease === lease) rows.delete(id);
    }
  };
  return { repository, rows };
}

describe("authenticated encrypted WSAA tickets", () => {
  it("requires canonical base64 of exactly 32 bytes, with no empty/key-prefix fallback", () => {
    expect(parseTicketEncryptionKey(secret)).toHaveLength(32);
    for (const invalid of [undefined, "", "base64:" + secret, secret + " ", Buffer.alloc(16).toString("base64"), "x".repeat(44)]) {
      expect(() => parseTicketEncryptionKey(invalid)).toThrow(/ARCA_TICKET_ENCRYPTION_KEY/);
    }
  });
  it("encrypts token/sign with a fresh nonce and binds environment/CUIT/certificate/service/expiration", () => {
    const sealed = encryptTicket(ticket, key, secret, now);
    expect(sealed.ciphertext).not.toContain(ticket.token);
    expect(sealed.ciphertext).not.toContain(ticket.sign);
    expect(encryptTicket(ticket, key, secret, now).ciphertext).not.toBe(sealed.ciphertext);
    expect(decryptTicket(sealed, key, secret, now)).toEqual(ticket);
    for (const scope of [{ ...key, environment: "production" as const }, { ...key, fingerprint: "b".repeat(64) }, { ...key, cuit: key.cuit.slice(0, -1) + "7" }]) {
      expect(() => decryptTicket(sealed, scope, secret, now)).toThrow();
    }
    expect(() => decryptTicket({ ...sealed, expires: sealed.expires + 1000 }, key, secret, now)).toThrow();
  });
  it("fails closed on unknown prefixes, tampering, wrong keys, empty fields and expired tickets", () => {
    const sealed = encryptTicket(ticket, key, secret, now);
    for (const ciphertext of [sealed.ciphertext.replace(/^v1/, "v2"), "plaintext-token", sealed.ciphertext.slice(0, -4) + "AAAA"]) {
      expect(() => decryptTicket({ ...sealed, ciphertext }, key, secret, now)).toThrow();
    }
    expect(() => decryptTicket(sealed, key, Buffer.alloc(32, 8).toString("base64"), now)).toThrow();
    expect(() => decryptTicket(sealed, key, secret, ticket.expires - 120000)).toThrow();
    expect(() => encryptTicket({ ...ticket, token: "" }, key, secret, now)).toThrow();
    expect(() => encryptTicket({ ...ticket, sign: " " }, key, secret, now)).toThrow();
    expect(() => encryptTicket({ ...ticket, expires: now + 86400001 }, key, secret, now)).toThrow();
  });
});

describe("shared WSAA coordination across independent instances", () => {
  it("authenticates once for two instances and persists only ciphertext before either returns", async () => {
    const { repository, rows } = memoryRepository();
    const authenticate = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return ticket; });
    const createInstance = () => () => getSharedAccessTicket({ repository, key, encryptionKey: secret, authenticate, now: () => now, sleep: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); } });
    const results = await Promise.all([createInstance()(), createInstance()()]);
    expect(results).toEqual([ticket, ticket]);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([...rows.values()])).not.toContain(ticket.token);
    expect(await createInstance()()).toEqual(ticket);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it("isolates homologation from production for the same issuer and certificate", async () => {
    const { repository } = memoryRepository();
    const authenticate = vi.fn(async () => ticket);
    for (const environment of ["homologation", "production"] as const) {
      await getSharedAccessTicket({ repository, key: { ...key, environment }, encryptionKey: secret, authenticate, now: () => now });
    }
    expect(authenticate).toHaveBeenCalledTimes(2);
  });
  it("releases a failed authentication and permits a valid retry, but never returns empty credentials", async () => {
    const { repository } = memoryRepository();
    const authenticate = vi.fn().mockResolvedValueOnce({ ...ticket, token: "" }).mockResolvedValueOnce(ticket);
    const options = { repository, key, encryptionKey: secret, authenticate, now: () => now };
    await expect(getSharedAccessTicket(options)).rejects.toThrow();
    expect(await getSharedAccessTicket(options)).toEqual(ticket);
    expect(authenticate).toHaveBeenCalledTimes(2);
  });
  it("does not discard an invalid encrypted entry or reauthenticate when a key/prefix is wrong", async () => {
    const { repository, rows } = memoryRepository();
    rows.set(JSON.stringify(key), { sealed: { ...encryptTicket(ticket, key, secret, now), ciphertext: "v9.invalid" } });
    const authenticate = vi.fn(async () => ticket);
    await expect(getSharedAccessTicket({ repository, key, encryptionKey: secret, authenticate, now: () => now })).rejects.toThrow();
    expect(authenticate).not.toHaveBeenCalled();
    expect(rows.size).toBe(1);
  });
  it("recovers a lost publication response by reading the committed encrypted entry", async () => {
    const { repository } = memoryRepository();
    const publish = repository.publish;
    repository.publish = async (...args) => { await publish(...args); throw new Error("synthetic lost response"); };
    const authenticate = vi.fn(async () => ticket);
    expect(await getSharedAccessTicket({ repository, key, encryptionKey: secret, authenticate, now: () => now })).toEqual(ticket);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it("retries publication with the identical ciphertext and lease, never another authentication", async () => {
    const { repository } = memoryRepository();
    const publish = repository.publish;
    const attempts: unknown[] = [];
    repository.publish = async (...args) => {
      attempts.push(args);
      if (attempts.length === 1) throw new Error("synthetic transport failure before commit");
      return publish(...args);
    };
    const authenticate = vi.fn(async () => ticket);
    expect(await getSharedAccessTicket({ repository, key, encryptionKey: secret, authenticate, now: () => now })).toEqual(ticket);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it("fails closed without using a local ticket when shared storage is unavailable", async () => {
    const { repository } = memoryRepository();
    repository.publish = async () => { throw new Error("synthetic storage unavailable"); };
    const authenticate = vi.fn(async () => ticket);
    await expect(getSharedAccessTicket({ repository, key, encryptionKey: secret, authenticate, now: () => now })).rejects.toThrow(/compartido/i);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it("bounds waiting for another instance without submitting another CMS", async () => {
    const { repository } = memoryRepository();
    repository.claim = async () => ({ kind: "busy" });
    let elapsed = 0;
    const authenticate = vi.fn(async () => ticket);
    await expect(getSharedAccessTicket({ repository, key, encryptionKey: secret, authenticate, now: () => now + elapsed,
      maxWaitMs: 1000, sleep: async (ms) => { elapsed += ms; } })).rejects.toThrow(/ocupado/i);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
