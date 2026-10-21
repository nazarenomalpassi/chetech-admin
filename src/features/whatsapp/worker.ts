import type { DocumentJob } from "./protocol";

type Dependencies = {
  update: (action: string, value?: string) => Promise<boolean>;
  pdf: () => Promise<{ bytes: Buffer; filename: string }>;
  upload: (bytes: Buffer, filename: string) => Promise<string>;
  send: (mediaId: string, filename: string) => Promise<string>;
};

/** Persist intent before crossing the provider boundary. Unknown outcomes are never blindly resent. */
export async function processDocumentJob(job: DocumentJob, deps: Dependencies) {
  let prepared: Awaited<ReturnType<Dependencies["pdf"]>>;
  let media = job.media_id;
  try {
    prepared = await deps.pdf();
    if (!await deps.update("prepare")) return;
    if (!media) {
      media = await deps.upload(prepared.bytes, prepared.filename);
      if (!await deps.update("media", media)) return;
    }
  } catch (error) {
    const e = error as { code?: string; disposition?: string };
    await deps.update(e.disposition === "blocked" ? "blocked" : "retry", e.code || "prepare_failed"); return;
  }
  if (!await deps.update("submitting")) return;
  let message: string;
  try { message = await deps.send(media, prepared.filename); }
  catch (error) {
    const e = error as { code?: string; disposition?: string };
    const action = ["retry", "blocked", "failed", "uncertain"].includes(e.disposition || "") ? e.disposition! : "uncertain";
    await deps.update(action, e.code || "submission_unknown"); return;
  }
  try { if (!await deps.update("accepted", message)) throw new Error("Unconfirmed acceptance"); }
  catch { await deps.update("uncertain", "acceptance_record_failed"); }
}
