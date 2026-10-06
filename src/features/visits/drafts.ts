import { z } from "zod";

const fields = z.object({
  customerName: z.string().max(300).optional(), customerPhone: z.string().max(100).optional(), address: z.string().max(1000).optional(),
  visitDate: z.string().max(10).optional(), timeFrom: z.string().max(5).optional(), timeTo: z.string().max(5).optional(),
  reason: z.string().max(1000).optional(), notes: z.string().max(2000).optional(), status: z.string().max(30).optional(),
  technicianId: z.string().max(36).optional(), repairNumber: z.string().max(30).optional()
});
const envelope = z.object({ ownerId: z.string(), visitId: z.string(), sourceVersion: z.string(), token: z.string().max(100), savedAt: z.number().finite(), fields });
export type VisitDraft = z.infer<typeof envelope>;
export const visitDraftFieldNames = Object.keys(fields.shape);
export function visitDraftStorageKey(ownerId: string, visitId: string) { return `chetech:visits-draft:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(visitId)}`; }
export function serializeVisitDraft(value: VisitDraft) { return JSON.stringify(envelope.parse(value)); }
export function parseVisitDraft(raw: string | null, ownerId: string, visitId: string, now = Date.now()): VisitDraft | null {
  if (!raw || raw.length > 15000) return null;
  try {
    const result = envelope.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    const draft = result.data;
    return draft.ownerId === ownerId && draft.visitId === visitId && draft.savedAt <= now && now - draft.savedAt <= 86400000 ? draft : null;
  } catch { return null; }
}
