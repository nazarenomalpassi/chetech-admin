import { isFiscalPointOfSaleAllowed, validateCuit, type FiscalEnvironment, type FiscalIssuer } from "./model";
import { parseTicketEncryptionKey } from "./ticket-crypto";

export const ENDPOINTS = {
  homologation: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  production: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" }
} as const;

export function readFiscalConfig(env: Record<string, string | undefined> = process.env) {
  if (typeof window !== "undefined") throw new Error("La configuracion fiscal privada solo puede leerse en el servidor.");
  const environment: FiscalEnvironment = env.ARCA_ENVIRONMENT === "production" ? "production" : "homologation";
  const prefix = environment === "production" ? "ARCA_PROD" : "ARCA_HOMO";
  const rawPv = env[`${prefix}_POINT_OF_SALE`];
  const pointOfSale = rawPv && /^\d{1,5}$/.test(rawPv) ? Number(rawPv) : null;
  const issues: string[] = [];
  if (env.ARCA_ENVIRONMENT && !["production", "homologation"].includes(env.ARCA_ENVIRONMENT)) issues.push("Entorno ARCA invalido: usa homologation o production.");
  if (environment === "production" && env.ARCA_PRODUCTION_ENABLED !== "true") issues.push("Produccion bloqueada: falta habilitacion explicita ARCA_PRODUCTION_ENABLED.");
  if (environment === "production" && pointOfSale === 1) issues.push("PV00001 esta reservado a Factura en Linea en la instalacion productiva constatada. Configura otro punto de venta habilitado para WS.");
  else if (pointOfSale === null || !isFiscalPointOfSaleAllowed(pointOfSale, environment)) issues.push("Falta un punto de venta Web Services explicitamente configurado para este entorno.");
  if (env[`${prefix}_WS_POINT_OF_SALE_VERIFIED`] !== "true") issues.push("Falta confirmar el alta del punto de venta para Web Services.");
  const certificatePath = env[`${prefix}_CERTIFICATE_PATH`], privateKeyPath = env[`${prefix}_PRIVATE_KEY_PATH`];
  const certificatePem = env[`${prefix}_CERTIFICATE_PEM`]?.replace(/\\n/g, "\n").trim();
  const privateKeyPem = env[`${prefix}_PRIVATE_KEY_PEM`]?.replace(/\\n/g, "\n").trim();
  if (!certificatePath && !certificatePem) issues.push(`Falta certificado ARCA: ${prefix}_CERTIFICATE_PEM o ${prefix}_CERTIFICATE_PATH, solo en servidor.`);
  if (!privateKeyPath && !privateKeyPem) issues.push(`Falta clave privada: ${prefix}_PRIVATE_KEY_PEM o ${prefix}_PRIVATE_KEY_PATH, solo en servidor.`);
  let issuerCuit = "";
  try { issuerCuit = validateCuit(env.ARCA_ISSUER_CUIT?.trim() ?? ""); }
  catch { issues.push("ARCA_ISSUER_CUIT: falta CUIT del emisor valida, configurada solo en servidor."); }
  const issuer: FiscalIssuer = { cuit: issuerCuit, name: env.ARCA_ISSUER_NAME ?? "", address: env.ARCA_ISSUER_ADDRESS ?? "",
    grossIncome: env.ARCA_ISSUER_GROSS_INCOME ?? "", activityStart: env.ARCA_ISSUER_ACTIVITY_START ?? "" };
  if (!issuer.name.trim() || issuer.name.length > 500) issues.push("ARCA_ISSUER_NAME: falta razon social legal del emisor (maximo 500 caracteres).");
  if (!issuer.address.trim() || issuer.address.length > 500) issues.push("ARCA_ISSUER_ADDRESS: falta domicilio fiscal/comercial (maximo 500 caracteres).");
  if (!issuer.grossIncome.trim() || issuer.grossIncome.length > 100) issues.push("ARCA_ISSUER_GROSS_INCOME: falta identificacion de Ingresos Brutos o condicion real de exencion (maximo 100 caracteres).");
  const activityDate = new Date(`${issuer.activityStart}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuer.activityStart) || Number.isNaN(activityDate.getTime()) || activityDate.toISOString().slice(0, 10) !== issuer.activityStart) issues.push("ARCA_ISSUER_ACTIVITY_START: falta fecha real de inicio de actividades (AAAA-MM-DD).");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) issues.push("Falta credencial de servicio del servidor para el registro fiscal protegido.");
  const ticketEncryptionKey = env.ARCA_TICKET_ENCRYPTION_KEY;
  if (!issues.length) {
    try { parseTicketEncryptionKey(ticketEncryptionKey); }
    catch { issues.push("ARCA_TICKET_ENCRYPTION_KEY: falta clave privada base64 canonica de 32 bytes para el cache WSAA compartido."); }
  }
  return { environment, pointOfSale, issuer, certificatePath, privateKeyPath, certificatePem, privateKeyPem, ticketEncryptionKey, issues, endpoints: ENDPOINTS[environment] };
}

export type FiscalConfig = ReturnType<typeof readFiscalConfig>;
export type FiscalReadiness = { environment: FiscalEnvironment; pointOfSale: number | null; issuerCuit: string; ready: boolean; issues: string[]; today: string };
