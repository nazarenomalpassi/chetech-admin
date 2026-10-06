import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { FiscalEnvironment } from "./model";

export type AccessTicket = { token: string; sign: string; expires: number };
export type TicketKey = { environment: FiscalEnvironment; cuit: string; fingerprint: string; service: "wsfe" };
export type SealedTicket = { ciphertext: string; expires: number };
export const TICKET_MARGIN_MS = 120000;

export function parseTicketEncryptionKey(value: string | undefined): Buffer {
  if (typeof window !== "undefined") throw new Error("Las claves fiscales solo pueden usarse en el servidor.");
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("ARCA_TICKET_ENCRYPTION_KEY: falta clave privada base64 canonica de 32 bytes.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("ARCA_TICKET_ENCRYPTION_KEY: debe contener exactamente 32 bytes en base64 canonico.");
  return key;
}

function validateTicket(value: AccessTicket, now: number) {
  if (!value || typeof value.token !== "string" || !value.token.trim() || value.token.length > 262144 ||
    typeof value.sign !== "string" || !value.sign.trim() || value.sign.length > 262144 ||
    !Number.isSafeInteger(value.expires) || value.expires <= now + TICKET_MARGIN_MS || value.expires > now + 86400000) {
    throw new Error("Ticket WSAA invalido o proximo a vencer; no se utilizaran credenciales vacias.");
  }
  return { token: value.token, sign: value.sign, expires: value.expires };
}

function associatedData(key: TicketKey, expires: number) {
  return Buffer.from(JSON.stringify(["wsaa-ticket-v1", key.environment, key.cuit, key.fingerprint, key.service, expires]), "utf8");
}

export function encryptTicket(ticket: AccessTicket, scope: TicketKey, encryptionKey: string, now = Date.now()): SealedTicket {
  const validated = validateTicket(ticket, now), nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseTicketEncryptionKey(encryptionKey), nonce);
  cipher.setAAD(associatedData(scope, validated.expires));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(validated), "utf8"), cipher.final()]);
  return { ciphertext: ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join("."), expires: validated.expires };
}

function decode(value: string, length?: number) {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("Invalid ciphertext");
  const decoded = Buffer.from(value, "base64");
  if ((length !== undefined && decoded.length !== length) || decoded.toString("base64") !== value) throw new Error("Invalid ciphertext");
  return decoded;
}

export function decryptTicket(sealed: SealedTicket, scope: TicketKey, encryptionKey: string, now = Date.now()): AccessTicket {
  const key = parseTicketEncryptionKey(encryptionKey);
  try {
    if (typeof sealed.ciphertext !== "string" || sealed.ciphertext.length > 800000 || !Number.isSafeInteger(sealed.expires)) throw new Error("Invalid ciphertext");
    const parts = sealed.ciphertext.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, decode(parts[1], 12));
    decipher.setAAD(associatedData(scope, sealed.expires));
    decipher.setAuthTag(decode(parts[2], 16));
    const plaintext = Buffer.concat([decipher.update(decode(parts[3])), decipher.final()]);
    const ticket = validateTicket(JSON.parse(plaintext.toString("utf8")), now);
    if (ticket.expires !== sealed.expires) throw new Error("Invalid expiration");
    return ticket;
  } catch { throw new Error("No se pudo validar el ticket WSAA cifrado compartido. Revisa la clave del servidor; no se descartara un ticket vigente."); }
}
