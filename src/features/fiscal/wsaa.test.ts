import forge from "node-forge";
import { createHash, X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildLoginTicketRequest, signLoginTicket, validateCredentials, parseAccessTicket, parseWsaaResponse, loadFiscalCredentials, getAccessTicket } from "./wsaa";
import { readFiscalConfig } from "./config";
import { envelope, escapeXml } from "./xml";
import type { TicketCacheRepository } from "./ticket-cache";
import type { SealedTicket } from "./ticket-crypto";

function certificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01T00:00:00Z"); cert.validity.notAfter = new Date("2027-01-01T00:00:00Z");
  cert.setSubject([{ name: "commonName", value: "Synthetic test only" }, { name: "serialNumber", value: "CUIT 20123456786" }]);
  cert.setIssuer(cert.subject.attributes); cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certificatePem: forge.pki.certificateToPem(cert), privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}
describe("WSAA CMS authentication without a fiscal password", () => {
  it("creates a CMS SignedData containing the wsfe TRA and certificate", () => {
    const now = new Date("2026-10-05T15:00:00Z");
    const credentials = validateCredentials(certificate(), "20123456786", now);
    const tra = buildLoginTicketRequest(now);
    expect(tra).toContain("<service>wsfe</service>");
    expect(tra).toContain("2026-10-05T14:55:00.000Z");
    const cms = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(signLoginTicket(tra, credentials))));
    const root = forge.asn1.fromDer(forge.util.decode64(signLoginTicket(tra, credentials)));
    const oid = (root.value as forge.asn1.Asn1[])[0].value as string;
    expect(forge.asn1.derToOid(oid)).toBe(forge.pki.oids.signedData);
    expect("certificates" in cms && cms.certificates).toHaveLength(1);
  });
  it("rejects mismatched CUIT, expired certificate and private key mismatch", () => {
    const valid = certificate();
    expect(() => validateCredentials(valid, "20123456787", new Date("2026-10-05"))).toThrow();
    expect(() => validateCredentials(valid, "20123456786", new Date("2028-01-01"))).toThrow();
    expect(() => validateCredentials({ ...valid, privateKeyPem: certificate().privateKeyPem }, "20123456786", new Date("2026-10-05"))).toThrow();
  });
  it("requires the ticket to address the configured CUIT and have valid expiration", () => {
    const ticket = '<loginTicketResponse><header><destination>CN=test,SERIALNUMBER=CUIT 20123456786</destination><generationTime>2026-10-05T14:55:00Z</generationTime><expirationTime>2026-10-06T03:00:00Z</expirationTime></header><credentials><token>synthetic-token</token><sign>synthetic-sign</sign></credentials></loginTicketResponse>';
    expect(parseAccessTicket(ticket, "20123456786", new Date("2026-10-05T15:00:00Z")).token).toBe("synthetic-token");
    expect(() => parseAccessTicket(ticket, "20123456787", new Date("2026-10-05T15:00:00Z"))).toThrow();
    expect(() => parseAccessTicket(ticket, "20123456786", new Date("2026-10-07T15:00:00Z"))).toThrow();
  });
  it("accepts namespaced SOAP response prefixes but never credentials from a fault", () => {
    const ticket = '<loginTicketResponse><header><destination>CN=test,SERIALNUMBER=CUIT 20123456786</destination><generationTime>2026-10-05T14:55:00Z</generationTime><expirationTime>2026-10-06T03:00:00Z</expirationTime></header><credentials><token>synthetic-token</token><sign>synthetic-sign</sign></credentials></loginTicketResponse>';
    const soap = envelope(`<ns2:loginCmsResponse xmlns:ns2="http://wsaa.view.sua.dvadac.desein.afip.gov"><ns2:loginCmsReturn>${escapeXml(ticket)}</ns2:loginCmsReturn></ns2:loginCmsResponse>`);
    expect(parseWsaaResponse(soap, "20123456786", new Date("2026-10-05T15:00:00Z")).token).toBe("synthetic-token");
    const fault = envelope('<soap:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>SECRET_REMOTE_RESPONSE</faultstring></soap:Fault>');
    expect(() => parseWsaaResponse(fault, "20123456786")).toThrow(/TA vigente/);
    expect(() => parseWsaaResponse(fault, "20123456786")).not.toThrow(/SECRET_REMOTE_RESPONSE/);
    expect(() => parseWsaaResponse(envelope("<loginCmsResponse><loginCmsReturn/></loginCmsResponse>"), "20123456786")).toThrow();
  });
  it("hashes canonical DER identically for LF, CRLF and rewrapped PEM Base64", () => {
    const pem = certificate(), date = new Date("2026-10-05");
    const body = pem.certificatePem.replace(/-----[^\r\n]+-----/g, "").replace(/\s/g, "");
    const rewrap = (width: number, newline: string) => ["-----BEGIN CERTIFICATE-----", ...body.match(new RegExp(`.{1,${width}}`, "g"))!, "-----END CERTIFICATE-----", ""].join(newline);
    const variants = [pem.certificatePem, pem.certificatePem.replace(/\r\n/g, "\n"), rewrap(48, "\n"), rewrap(76, "\r\n")];
    const expected = createHash("sha256").update(new X509Certificate(pem.certificatePem).raw).digest("hex");
    expect(new Set(variants.map((value) => createHash("sha256").update(value).digest("hex"))).size).toBeGreaterThan(1);
    for (const certificatePem of variants) {
      expect(validateCredentials({ ...pem, certificatePem }, "20123456786", date).fingerprint).toBe(expected);
    }
  });
  it("assigns a different fingerprint to a reissued certificate even with the same CUIT and key", () => {
    const pem = certificate(), date = new Date("2026-10-05");
    const reissued = forge.pki.certificateFromPem(pem.certificatePem);
    reissued.serialNumber = "02";
    reissued.sign(forge.pki.privateKeyFromPem(pem.privateKeyPem), forge.md.sha256.create());
    const other = { ...pem, certificatePem: forge.pki.certificateToPem(reissued) };
    expect(validateCredentials(other, "20123456786", date).fingerprint).not.toBe(validateCredentials(pem, "20123456786", date).fingerprint);
  });
  it("routes independent WSAA callers through the encrypted repository, not a module memory cache", async () => {
    const pem = certificate();
    const config = readFiscalConfig({ ARCA_TICKET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), ARCA_ISSUER_CUIT: "20123456786",
      ARCA_HOMO_POINT_OF_SALE: "2", ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: "true", ARCA_HOMO_CERTIFICATE_PEM: pem.certificatePem,
      ARCA_HOMO_PRIVATE_KEY_PEM: pem.privateKeyPem, ARCA_ISSUER_NAME: "Emisor", ARCA_ISSUER_ADDRESS: "Domicilio",
      ARCA_ISSUER_GROSS_INCOME: "Exento", ARCA_ISSUER_ACTIVITY_START: "2020-01-01", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key" });
    const credentials = validateCredentials(pem, config.issuer.cuit);
    let stored: SealedTicket | undefined, leased = false, calls = 0;
    const instanceRepository = (): TicketCacheRepository => ({
      async claim(key) {
        expect(key).toEqual({ environment: "homologation", cuit: "20123456786", fingerprint: credentials.fingerprint, service: "wsfe" });
        if (stored) return { kind: "cached", ...stored };
        if (leased) return { kind: "busy" };
        leased = true; return { kind: "acquired", token: "synthetic-lease" };
      },
      async publish(_, __, sealed) { stored = sealed; leased = false; return true; },
      async release() { leased = false; }
    });
    const fetcher: typeof fetch = async () => {
      calls++;
      const ticket = `<loginTicketResponse><header><destination>CN=test,SERIALNUMBER=CUIT ${config.issuer.cuit}</destination><generationTime>${new Date().toISOString()}</generationTime><expirationTime>${new Date(Date.now() + 43200000).toISOString()}</expirationTime></header><credentials><token>synthetic-token</token><sign>synthetic-sign</sign></credentials></loginTicketResponse>`;
      return new Response(envelope(`<ns:loginCmsResponse xmlns:ns="http://wsaa.view.sua.dvadac.desein.afip.gov"><ns:loginCmsReturn>${escapeXml(ticket)}</ns:loginCmsReturn></ns:loginCmsResponse>`));
    };
    const results = await Promise.all([getAccessTicket(config, credentials, fetcher, instanceRepository()), getAccessTicket(config, credentials, fetcher, instanceRepository())]);
    expect(results[0]).toEqual(results[1]);
    expect(calls).toBe(1);
    expect(JSON.stringify(stored)).not.toMatch(/synthetic-token|synthetic-sign/);
    stored = { ...stored!, ciphertext: "v9.invalid" };
    await expect(getAccessTicket(config, credentials, fetcher, instanceRepository())).rejects.toThrow(/cifrado/);
    expect(calls).toBe(1);
  });
  it("loads and validates escaped-newline PEM from server environment without file access", async () => {
    const pem = certificate();
    const config = readFiscalConfig({ ARCA_TICKET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), ARCA_ISSUER_CUIT: "20123456786", ARCA_HOMO_POINT_OF_SALE: "2", ARCA_HOMO_WS_POINT_OF_SALE_VERIFIED: "true",
      ARCA_HOMO_CERTIFICATE_PEM: pem.certificatePem.replace(/\n/g, "\\n"), ARCA_HOMO_PRIVATE_KEY_PEM: pem.privateKeyPem.replace(/\n/g, "\\n"),
      ARCA_ISSUER_NAME: "Emisor", ARCA_ISSUER_ADDRESS: "Domicilio", ARCA_ISSUER_GROSS_INCOME: "Exento",
      ARCA_ISSUER_ACTIVITY_START: "2020-01-01", SUPABASE_SERVICE_ROLE_KEY: "synthetic service key" });
    expect((await loadFiscalCredentials(config)).fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(loadFiscalCredentials({ ...config, privateKeyPem: certificate().privateKeyPem })).rejects.toThrow();
  });
});
