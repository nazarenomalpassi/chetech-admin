import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { mapOrder } from "@/features/repairs-access/queries";
import { buildRepairDocumentData } from "@/features/repairs-access/documents";
import { readDocumentPayments } from "@/features/repairs-access/document-payments";
import { generateRepairDocumentPdf } from "@/features/repairs-access/repair-document-pdf";
import { getWhatsAppConfig } from "./protocol";
import { uploadDocument, sendDocument } from "./provider";
import { processDocumentJob } from "./worker";

export function createWhatsAppServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("WhatsApp server connection is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const jobSchema = z.object({ id: z.string().uuid(), order_id: z.string().uuid(), kind: z.enum(["intake", "delivery"]),
  lease_token: z.string().uuid(), recipient: z.string().regex(/^549\d{10}$/), media_id: z.string().nullable(), created_at: z.string(), snapshot: z.record(z.any()) });

export async function runWhatsAppWorker() {
  const config = getWhatsAppConfig();
  if (!config) return { configured: false, processed: 0 };
  const client = createWhatsAppServiceClient();
  let processed = 0;
  for (let i = 0; i < 2; i++) {
    const claim = await client.rpc("whatsapp_claim_document");
    if (claim.error) throw new Error("Document queue unavailable");
    if (!claim.data) break;
    if (claim.data.skipped) continue;
    const job = jobSchema.parse(claim.data);
    await processDocumentJob(job, {
      async update(action, value) {
        const result = await client.rpc("whatsapp_update_document", { p_id: job.id, p_lease: job.lease_token, p_action: action, p_value: value ?? null });
        if (result.error) throw new Error("Document state unavailable");
        return result.data === true;
      },
      async pdf() {
        const order = mapOrder(job.snapshot as Parameters<typeof mapOrder>[0]);
        const payments = job.kind === "delivery" ? readDocumentPayments(job.snapshot) : undefined;
        const data = buildRepairDocumentData(order, job.kind, null, payments);
        data.issuedAt = job.snapshot.document_generated_at || job.created_at;
        const suffix = job.kind === "intake" ? "ingreso-de-equipo" : "pago-y-garantia";
        return { bytes: await generateRepairDocumentPdf(data), filename: `CHETECH-${data.number.replace(/[^a-zA-Z0-9-]/g, "")}-${suffix}.pdf` };
      },
      upload: (bytes, filename) => uploadDocument(config, bytes, filename),
      send: (media, filename) => sendDocument(config, job, media, filename)
    });
    processed++;
  }
  return { configured: true, processed };
}
