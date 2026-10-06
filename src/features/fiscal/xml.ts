import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { FiscalSnapshot } from "./model";

export const WSFE_NAMESPACE = "http://ar.gov.afip.dif.FEV1/";
const MAX_XML_BYTES = 1024 * 1024;

export function escapeXml(value: string | number) {
  const text = String(value);
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error("Texto XML invalido.");
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

export function safeParseXml(xml: string): Record<string, any> {
  if (Buffer.byteLength(xml) > MAX_XML_BYTES || /<!\s*(DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Respuesta XML ARCA invalida.");
  const parsed = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, processEntities: false, trimValues: true }).parse(xml);
  // Decode only XML's five predefined entities. Never resolve declared entities.
  const decode = (value: any): any => typeof value === "string" ? value.replace(/&(lt|gt|quot|apos|amp);/g, (_, entity: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[entity]!)
    : Array.isArray(value) ? value.map(decode) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child)])) : value;
  return decode(parsed);
}

export function parseSoapResult(xml: string, operation: string): Record<string, any> {
  const body = safeParseXml(xml).Envelope?.Body;
  if (!body || body.Fault) throw new Error("El servicio ARCA no pudo completar la solicitud.");
  const response = body[`${operation}Response`];
  const result = response?.[`${operation}Result`];
  if (!result || typeof result !== "object") throw new Error("Respuesta SOAP ARCA inesperada.");
  return result;
}

export function envelope(content: string) {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${content}</soap:Body></soap:Envelope>`;
}
export function authXml(cuit: string, token: string, sign: string) {
  return `<Auth><Token>${escapeXml(token)}</Token><Sign>${escapeXml(sign)}</Sign><Cuit>${escapeXml(cuit)}</Cuit></Auth>`;
}

export function buildAuthorizationXml(s: FiscalSnapshot, number: number, token: string, sign: string, reference: string) {
  const date = (value: string) => value.replace(/-/g, "");
  const amount = (s.totalCents / 100).toFixed(2);
  const service = s.concept === 1 ? "" : `<FchServDesde>${date(s.serviceFrom!)}</FchServDesde><FchServHasta>${date(s.serviceTo!)}</FchServHasta><FchVtoPago>${date(s.paymentDue!)}</FchVtoPago>`;
  return envelope(`<FECAESolicitar xmlns="${WSFE_NAMESPACE}">${authXml(s.issuer.cuit, token, sign)}<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${s.pointOfSale}</PtoVta><CbteTipo>11</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest><Concepto>${s.concept}</Concepto><DocTipo>${s.receiver.documentType}</DocTipo><DocNro>${escapeXml(s.receiver.documentNumber)}</DocNro><CbteDesde>${number}</CbteDesde><CbteHasta>${number}</CbteHasta><CbteFch>${date(s.issuedOn)}</CbteFch><ImpTotal>${amount}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${amount}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>0.00</ImpIVA>${service}<MonId>PES</MonId><MonCotiz>1</MonCotiz><CondicionIVAReceptorId>${s.receiver.ivaCondition}</CondicionIVAReceptorId><Opcionales><Opcional><Id>23</Id><Valor>${escapeXml(reference)}</Valor></Opcional></Opcionales></FECAEDetRequest></FeDetReq></FeCAEReq></FECAESolicitar>`);
}

export async function soapPost(url: string, action: string, xml: string, fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(url, { method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` }, body: xml });
    if (!response.ok || !response.body) throw new Error("SOAP transport failure");
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_XML_BYTES) { await reader.cancel(); throw new Error("SOAP response too large"); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    throw new Error("ARCA no confirmo la respuesta dentro del transporte seguro. Consulta antes de reintentar.");
  } finally { clearTimeout(timer); }
}
