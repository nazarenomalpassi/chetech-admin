import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import forge from "node-forge";
import type { FiscalConfig } from "./config";
import { envelope, escapeXml, safeParseXml, soapPost } from "./xml";
import { getSharedAccessTicket, type TicketCacheRepository } from "./ticket-cache";
import { createTicketCacheRepository } from "./ticket-repository";

export function validateCredentials(pem: { certificatePem: string; privateKeyPem: string }, cuit: string, now = new Date()) {
  try {
    const certificate = forge.pki.certificateFromPem(pem.certificatePem);
    const privateKey = forge.pki.privateKeyFromPem(pem.privateKeyPem);
    const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
    const serial = String(certificate.subject.getField({ name: "serialNumber" })?.value ?? "");
    if (serial !== `CUIT ${cuit}` || certificate.validity.notBefore > now || certificate.validity.notAfter <= now ||
      publicKey.n.bitLength() < 2048 || !publicKey.n.equals(privateKey.n) || !publicKey.e.equals(privateKey.e)) throw new Error("Invalid credentials");
    const fingerprint = createHash("sha256").update(Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(), "binary")).digest("hex");
    return { certificate, privateKey, fingerprint, validUntil: certificate.validity.notAfter.toISOString() };
  } catch { throw new Error("El certificado y la clave privada no son validos, no corresponden al CUIT emisor o estan vencidos."); }
}

export async function loadFiscalCredentials(config: FiscalConfig) {
  if (config.issues.length || (!config.certificatePem && (!config.certificatePath || !isAbsolute(config.certificatePath))) ||
    (!config.privateKeyPem && (!config.privateKeyPath || !isAbsolute(config.privateKeyPath)))) throw new Error("Configuracion fiscal incompleta; indica PEM privado en servidor o rutas absolutas de certificado y clave.");
  try {
    const certificatePem = config.certificatePem ?? await readFile(config.certificatePath!, "utf8");
    const privateKeyPem = config.privateKeyPem ?? await readFile(config.privateKeyPath!, "utf8");
    if (certificatePem.length > 65536 || privateKeyPem.length > 65536) throw new Error("Invalid PEM size");
    return validateCredentials({ certificatePem, privateKeyPem }, config.issuer.cuit);
  } catch { throw new Error("No se pudo validar el certificado/clave privada del entorno configurado. Revisa su vigencia, CUIT y permisos del servidor."); }
}
export type FiscalCredentials = ReturnType<typeof validateCredentials>;

export function buildLoginTicketRequest(now = new Date()) {
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${new Date(now.getTime() - 300000).toISOString()}</generationTime><expirationTime>${new Date(now.getTime() + 43200000).toISOString()}</expirationTime></header><service>wsfe</service></loginTicketRequest>`;
}
export function signLoginTicket(tra: string, credentials: FiscalCredentials) {
  const cms = forge.pkcs7.createSignedData();
  cms.content = forge.util.createBuffer(tra, "utf8");
  cms.addCertificate(credentials.certificate);
  cms.addSigner({ key: credentials.privateKey, certificate: credentials.certificate, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [ { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest } ] });
  cms.sign();
  return forge.util.encode64(forge.asn1.toDer(cms.toAsn1()).getBytes());
}
export function parseAccessTicket(xml: string, cuit: string, now = new Date()) {
  const ticket = safeParseXml(xml).loginTicketResponse;
  const token = ticket?.credentials?.token, sign = ticket?.credentials?.sign;
  const expires = Date.parse(ticket?.header?.expirationTime ?? "");
  const generated = Date.parse(ticket?.header?.generationTime ?? "");
  const destination = String(ticket?.header?.destination ?? "");
  if (typeof token !== "string" || !token || typeof sign !== "string" || !sign || !Number.isFinite(expires) ||
    expires <= now.getTime() + 60000 || !Number.isFinite(generated) || generated > now.getTime() + 300000 ||
    !new RegExp(`(?:^|[,\\s])(?:SERIALNUMBER=)?CUIT ${cuit}(?:$|[,\\s])`, "i").test(destination)) throw new Error("Ticket WSAA invalido o no dirigido al CUIT emisor.");
  return { token, sign, expires };
}
export function parseWsaaResponse(xml: string, cuit: string, now = new Date()) {
  const body = safeParseXml(xml).Envelope?.Body;
  const response = body?.loginCmsResponse?.loginCmsReturn;
  if (body?.Fault || typeof response !== "string") throw new Error("WSAA no autorizo acceso al servicio wsfe. Revisa certificado y asociacion; un TA vigente debe reutilizarse hasta su vencimiento.");
  return parseAccessTicket(response, cuit, now);
}

export async function getAccessTicket(config: FiscalConfig, credentials: FiscalCredentials, fetcher: typeof fetch = fetch, repository?: TicketCacheRepository) {
  if (config.issues.length || !config.ticketEncryptionKey) throw new Error("Configuracion del cache WSAA compartido incompleta.");
  return getSharedAccessTicket({ repository: repository ?? createTicketCacheRepository(), encryptionKey: config.ticketEncryptionKey,
    key: { environment: config.environment, cuit: config.issuer.cuit, fingerprint: credentials.fingerprint, service: "wsfe" },
    authenticate: async () => {
    const cms = signLoginTicket(buildLoginTicketRequest(), credentials);
    const xml = envelope(`<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${escapeXml(cms)}</in0></loginCms>`);
    return parseWsaaResponse(await soapPost(config.endpoints.wsaa, "", xml, fetcher), config.issuer.cuit);
  } });
}
