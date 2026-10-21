import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { normalizeDocumentRecipient, verifyMetaSignature, buildDocumentTemplate, getWhatsAppConfig } from "./protocol";
import { processDocumentJob } from "./worker";

const config = { token: "synthetic-token", phoneId: "12345", businessId: "67890", version: "v25.0", appSecret: "synthetic-app-secret", verifyToken: "synthetic-verify", workerSecret: "synthetic-worker", language: "es_AR", intakeTemplate: "chetech_ingreso_equipo", deliveryTemplate: "chetech_pago_garantia" };
const job = { id: "00000000-0000-4000-8000-000000000001", order_id: "00000000-0000-4000-8000-000000000357", kind: "delivery" as const, lease_token: "lease", recipient: "5493571544683", media_id: null, created_at: "2026-10-21T10:00:00Z", snapshot: { repair_access_customers: { full_name: "Cliente Ejemplo" }, repair_number: "REP-000357" } };

describe("official WhatsApp document protocol", () => {
  it("accepts unambiguous local numbers and refuses to guess malformed numbers", () => {
    for (const value of ["3571 544683", "03571 544683", "+54 3571 544683", "+54 9 3571 544683"]) expect(normalizeDocumentRecipient(value)).toBe("5493571544683");
    for (const value of ["123", "357115544683", "54912345678999999", "+1 555 0123", ""]) expect(normalizeDocumentRecipient(value)).toBe("");
  });
  it("requires an exact raw-body HMAC, not a parsed or unsigned webhook", () => {
    const raw = '{"entry": []}';
    const signature = "sha256=" + createHmac("sha256", config.appSecret).update(raw).digest("hex");
    expect(verifyMetaSignature(raw, signature, config.appSecret)).toBe(true);
    expect(verifyMetaSignature(raw + " ", signature, config.appSecret)).toBe(false);
    expect(verifyMetaSignature(raw, null, config.appSecret)).toBe(false);
    expect(verifyMetaSignature(raw, signature, "")).toBe(false);
  });
  it("attaches a private uploaded media ID to the approved template with two body variables", () => {
    const message = buildDocumentTemplate(config, job, "media-123", "CHETECH-REP-000357-pago-y-garantia.pdf");
    expect(message).toMatchObject({ type: "template", to: job.recipient, biz_opaque_callback_data: job.id,
      template: { name: "chetech_pago_garantia", language: { code: "es_AR" }, components: [
        { type: "header", parameters: [{ type: "document", document: { id: "media-123", filename: expect.stringContaining("pago-y-garantia.pdf") } }] },
        { type: "body", parameters: [{ type: "text", text: "Cliente Ejemplo" }, { type: "text", text: "REP-000357" }] }
      ] } });
    expect(JSON.stringify(message)).not.toContain("link");
  });
  it("stays disconnected with absent credentials and never enables a Vercel preview", () => {
    expect(getWhatsAppConfig({})).toBeNull();
    expect(getWhatsAppConfig({ VERCEL_ENV: "preview" })).toBeNull();
  });
});

describe("durable document worker", () => {
  function fixtures() {
    const update = vi.fn().mockResolvedValue(true), upload = vi.fn().mockResolvedValue("media-123"), send = vi.fn().mockResolvedValue("wamid.123");
    const pdf = vi.fn().mockResolvedValue({ bytes: Buffer.from("%PDF-test"), filename: "receipt.pdf" });
    return { update, upload, send, pdf };
  }
  it("persists the submitting marker before sending and records acceptance separately from delivery", async () => {
    const f = fixtures();
    await processDocumentJob(job, f);
    expect(f.update.mock.calls.map((call) => call[0])).toEqual(["prepare", "media", "submitting", "accepted"]);
    expect(f.update.mock.invocationCallOrder[2]).toBeLessThan(f.send.mock.invocationCallOrder[0]);
    expect(f.update.mock.calls[3]).toEqual(["accepted", "wamid.123"]);
  });
  it("does not resend after a timeout with an unknown submission outcome", async () => {
    const f = fixtures(); f.send.mockRejectedValue(Object.assign(new Error("timeout"), { disposition: "uncertain", code: "send_timeout" }));
    await processDocumentJob(job, f);
    expect(f.update).toHaveBeenLastCalledWith("uncertain", "send_timeout");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("allows a retry when media upload fails before any message was submitted", async () => {
    const f = fixtures(); f.upload.mockRejectedValue(new Error("upload failed"));
    await processDocumentJob(job, f);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith("retry", "prepare_failed");
  });
  it("never sends if custody consent changed or the submitting CAS could not be confirmed", async () => {
    const f = fixtures(); f.update.mockImplementation(async (action) => action !== "submitting");
    await processDocumentJob(job, f);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("never uploads the PDF if permission was revoked while the PDF was preparing",async()=>{
    const f=fixtures();f.update.mockImplementation(async action=>action!=="prepare");
    await processDocumentJob(job,f);
    expect(f.pdf).toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
  });
  it("does not turn a successful provider send plus database timeout into an automatic resend", async () => {
    const f = fixtures(); f.update.mockImplementation(async (action) => { if (action === "accepted") throw new Error("db timeout"); return true; });
    await processDocumentJob(job, f);
    expect(f.update).toHaveBeenLastCalledWith("uncertain", "acceptance_record_failed");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
