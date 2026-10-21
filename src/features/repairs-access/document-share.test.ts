import { describe, expect, it } from "vitest";
import { createDocumentToken, hashDocumentToken, buildReceiptWhatsAppUrl, documentShareHeaders, sharedDocumentSchema, toSharedDocument } from "./document-share";
import { buildRepairDocumentData } from "./documents";

describe("manual customer document links", () => {
  it("uses distinct cryptographic 256-bit tokens and stores only their digest", () => {
    const a = createDocumentToken(), b = createDocumentToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).not.toBe(b);
    expect(hashDocumentToken(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDocumentToken(a)).not.toBe(a);
    expect(hashDocumentToken(a)).toBe(hashDocumentToken(a));
  });
  it("opens only WhatsApp Web with the customer's phone, receipt kind and protected URL", () => {
    const url = new URL(buildReceiptWhatsAppUrl({ phone: "3571544683", name: "Belén & Juan", number: "REP-000513", kind: "delivery", link: "https://chetech-admin.vercel.app/api/comprobantes/abc" }));
    expect(url.origin + url.pathname).toBe("https://web.whatsapp.com/send");
    expect(url.searchParams.get("phone")).toBe("5493571544683");
    expect(url.searchParams.get("text")).toContain("Belén & Juan");
    expect(url.searchParams.get("text")).toContain("pago y garantía");
    expect(url.searchParams.get("text")).toContain("REP-000513");
    expect(url.searchParams.get("text")).not.toContain("presupuesto de $");
    expect(() => buildReceiptWhatsAppUrl({phone:"123",name:"Cliente",number:"REP-1",kind:"intake",link:"https://local.test/api/comprobantes/x"})).toThrow();
  });
  it("marks customer PDFs as private, non-indexable and non-referring", () => {
    expect(documentShareHeaders["Cache-Control"]).toContain("no-store");
    expect(documentShareHeaders["Referrer-Policy"]).toBe("no-referrer");
    expect(documentShareHeaders["X-Robots-Tag"]).toContain("noindex");
  });
  it("rejects malformed snapshots and quote documents instead of exposing arbitrary data", () => {
    expect(sharedDocumentSchema.safeParse({kind:"estimate"}).success).toBe(false);
    expect(sharedDocumentSchema.safeParse({kind:"intake",client:{internalNotes:"secret"}}).success).toBe(false);
  });
  it.each(["none","needs_review"])("removes unused coverage details for %s warranties and all intake finances",status=>{
    const source:any={id:"id",repairNumber:"REP-000513",intakeDate:"2026-10-01",issueReported:"Falla",budgetAmount:120000,pickedUpAt:"2026-10-21T12:00:00Z",deliveredAt:null,customer:{fullName:"Cliente",phone:"3571544683",address:"Domicilio"},device:{deviceType:"TV",brand:"Marca",model:"Modelo",serialNumber:"Serie",color:"Negro",accessoryDetails:"Cable",visualCondition:"Bueno"}};
    const data={...buildRepairDocumentData(source,"delivery"),issuedAt:"2026-10-21T12:00:00.000Z"};
    data.client!.warranty={status:status as "none"|"needs_review",days:null,startsOn:"SECRET START",expiresOn:"SECRET END",conditions:"SECRET CONDITION"};
    const shared=toSharedDocument(data);expect(JSON.stringify(shared)).not.toContain("SECRET");
    expect(shared.client.phone).toBe("");expect(shared.client.address).toBe("");expect(shared.client.fault).toBe("");
    const intake=toSharedDocument({...buildRepairDocumentData(source,"intake"),issuedAt:data.issuedAt});
    expect(intake.amount).toBeNull();expect(intake.client.budget).toBeNull();expect(intake.client.finalTotal).toBeNull();expect(intake.client.payments).toEqual([]);
  });
});
