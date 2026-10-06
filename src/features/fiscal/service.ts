import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getInvoiceById } from "@/features/invoices/queries";
import { readFiscalConfig, type FiscalReadiness } from "./config";
import { buildFiscalSnapshot, businessDate, fiscalInputSchema, fiscalInputFromSnapshot, type FiscalRecord, type FiscalSnapshot } from "./model";
import { issueFiscalInvoice, snapshotHash } from "./issuance";
import { createFiscalRepository, createFiscalServiceClient, FISCAL_SAFE_COLUMNS, mapFiscalRecord, type FiscalReadClient } from "./repository";
import { getAccessTicket, loadFiscalCredentials } from "./wsaa";
import { WsfeClient } from "./wsfe";
import { FiscalHttpError } from "./request-security";

export type FiscalPreview = { requestId: string; snapshotHash: string; snapshot: FiscalSnapshot };
export type FiscalPanelState = { readiness: FiscalReadiness; records: FiscalRecord[]; customerName?: string; sourceType?: string };
export async function loadFiscalReadiness(): Promise<FiscalReadiness> {
  const config = readFiscalConfig();
  const issues = [...config.issues];
  if (!issues.length) {
    try { await loadFiscalCredentials(config); }
    catch { issues.push("Certificado/clave no accesibles, vencidos o no correspondientes al CUIT emisor. Revisa configuracion del servidor."); }
  }
  return { environment: config.environment, pointOfSale: config.pointOfSale, issuerCuit: config.issuer.cuit,
    ready: !issues.length, issues, today: businessDate() };
}
export async function loadFiscalPanelState(client: FiscalReadClient, invoiceId?: string): Promise<FiscalPanelState> {
  const readiness = await loadFiscalReadiness();
  if (!invoiceId) return { readiness, records: [] };
  z.string().uuid().parse(invoiceId);
  const { data, error } = await client.from("fiscal_issuance_records").select(FISCAL_SAFE_COLUMNS).eq("invoice_id", invoiceId).order("created_at", { ascending: false });
  if (error) {
    readiness.ready = false; readiness.issues.push("No se pudo leer el registro fiscal. Verifica que la migracion fiscal este aplicada y los permisos vigentes.");
    return { readiness, records: [] };
  }
  const doc = await getInvoiceById(invoiceId);
  return { readiness, records: (data ?? []).map(mapFiscalRecord), customerName: doc.customerName, sourceType: doc.sourceType };
}
export async function getFiscalRecord(client: FiscalReadClient, id: string) {
  z.string().uuid().parse(id);
  const { data, error } = await client.from("fiscal_issuance_records").select(FISCAL_SAFE_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) throw new FiscalHttpError(404, "Registro fiscal no encontrado.");
  return mapFiscalRecord(data);
}
export async function previewFiscalInvoice(invoiceId: string, raw: unknown): Promise<FiscalPreview> {
  z.string().uuid().parse(invoiceId);
  const input = fiscalInputSchema.parse(raw);
  const config = readFiscalConfig();
  const readiness = await loadFiscalReadiness();
  if (!readiness.ready || config.pointOfSale === null) throw new FiscalHttpError(409, "La integracion fiscal aun no esta configurada. Revisa los requisitos del panel.");
  if (input.issuedOn !== businessDate()) throw new FiscalHttpError(400, "Esta integracion emite con la fecha de hoy en Argentina. No admite retrofechado.");
  const doc = await getInvoiceById(invoiceId);
  const snapshot = buildFiscalSnapshot(doc, input, { ...config, pointOfSale: config.pointOfSale });
  return { requestId: randomUUID(), snapshotHash: snapshotHash(snapshot), snapshot };
}
const confirmSchema = z.object({ confirm: z.literal(true), requestId: z.string().uuid(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  environment: z.enum(["homologation", "production"]), input: fiscalInputSchema }).strict();
export async function confirmFiscalInvoice(invoiceId: string, raw: unknown, userId: string): Promise<FiscalRecord> {
  z.string().uuid().parse(invoiceId);
  const input = confirmSchema.parse(raw);
  const config = readFiscalConfig();
  if (config.environment !== input.environment) throw new FiscalHttpError(409, "El entorno cambio desde la vista previa. Recarga antes de confirmar.");
  const client = createFiscalServiceClient();
  const { data: previous, error } = await client.from("fiscal_issuance_records").select(FISCAL_SAFE_COLUMNS).eq("id", input.requestId).maybeSingle();
  if (error) throw new FiscalHttpError(503, "No se pudo leer el registro fiscal. No reintentes sin consultar el estado.");
  let snapshot: FiscalSnapshot;
  if (previous) {
    const record = mapFiscalRecord(previous);
    if (record.invoiceId !== invoiceId || record.snapshotHash !== input.snapshotHash || record.snapshot.environment !== input.environment ||
      JSON.stringify(fiscalInputFromSnapshot(record.snapshot)) !== JSON.stringify(input.input)) {
      // Reparse only the explicitly editable fiscal inputs, not snapshot metadata.
      throw new FiscalHttpError(409, "El identificador pertenece a otra solicitud fiscal.");
    }
    if (record.status === "accepted") return record;
    if (record.status === "rejected") throw new FiscalHttpError(409, "El intento fue rechazado. Genera una nueva vista previa corregida.");
    snapshot = record.snapshot;
  } else {
    const preview = await previewFiscalInvoice(invoiceId, input.input);
    if (preview.snapshotHash !== input.snapshotHash) throw new FiscalHttpError(409, "El comprobante o configuracion cambio desde la vista previa. Recarga.");
    snapshot = preview.snapshot;
  }
  const credentials = await loadFiscalCredentials(config);
  const gateway = new WsfeClient({ environment: config.environment, cuit: config.issuer.cuit, ticket: () => getAccessTicket(config, credentials) });
  return issueFiscalInvoice(createFiscalRepository(client), gateway, { requestId: input.requestId, userId, snapshot, snapshotHash: input.snapshotHash });
}
