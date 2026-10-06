import { describe, expect, it } from "vitest";
import { parseVisitDraft, visitDraftStorageKey, serializeVisitDraft } from "./drafts";
const now = Date.parse("2026-10-05T10:00:00Z");
const base = { ownerId: "admin", visitId: "visit", sourceVersion: "v1", token: "request-1", savedAt: now, fields: { customerName: "Juan", visitDate: "2026-10-08", notes: "Revision", created_by: "attacker", returnTo: "https://bad.example", id: "other" } };
describe("safe persisted visit drafts", () => {
  it("isolates accounts and edits and strips server metadata", () => {
    expect(visitDraftStorageKey("admin", "visit")).not.toBe(visitDraftStorageKey("other", "visit"));
    const draft = parseVisitDraft(serializeVisitDraft(base), "admin", "visit", now);
    expect(draft?.fields).toEqual({ customerName: "Juan", visitDate: "2026-10-08", notes: "Revision" });
    expect(parseVisitDraft(serializeVisitDraft(base), "other", "visit", now)).toBeNull();
  });
  it("rejects corrupt, expired or future-dated data without executing it", () => {
    expect(parseVisitDraft("{bad", "admin", "visit", now)).toBeNull();
    expect(parseVisitDraft(serializeVisitDraft(base), "admin", "visit", now + 86400001)).toBeNull();
    expect(parseVisitDraft(serializeVisitDraft({ ...base, savedAt: now + 100000 }), "admin", "visit", now)).toBeNull();
  });
});
