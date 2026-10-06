import { ENDPOINTS } from "./config";
import { decimalCents, isFiscalPointOfSaleAllowed, type FiscalAuthorization, type FiscalEnvironment, type FiscalSnapshot } from "./model";
import type { FiscalGateway } from "./issuance";
import { authXml, buildAuthorizationXml, envelope, parseSoapResult, soapPost, WSFE_NAMESPACE } from "./xml";

const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function codes(result: Record<string, any>) { return list(result.Errors?.Err).map((error: any) => Number(error.Code)).filter(Number.isInteger); }
function requireNoErrors(result: Record<string, any>) { if (codes(result).length || result.Errors?.Err) throw new Error("ARCA rechazo la consulta. Revisa habilitacion y datos fiscales."); }
function isoDate(raw: string) {
  if (!/^\d{8}$/.test(raw)) throw new Error("Fecha ARCA invalida.");
  const value = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Fecha ARCA invalida.");
  return value;
}
function authorization(data: any, number: number, query = false): FiscalAuthorization {
  const cae = String(query ? data.CodAutorizacion : data.CAE);
  if (data.Resultado !== "A" || !/^[1-9]\d{13}$/.test(cae) || (query && data.EmisionTipo !== "CAE")) throw new Error("No existe autorizacion CAE valida para este comprobante.");
  return { cae, number, expiresOn: isoDate(String(query ? data.FchVto : data.CAEFchVto)),
    observationCodes: list(data.Observaciones?.Obs).map((obs: any) => Number(obs.Code)).filter(Number.isInteger) };
}
function matchesIdentity(data: any, s: FiscalSnapshot, number: number) {
  return Number(data.Concepto) === s.concept && Number(data.DocTipo) === s.receiver.documentType &&
    Number(data.DocNro) === Number(s.receiver.documentNumber) && Number(data.CbteDesde) === number &&
    Number(data.CbteHasta) === number && data.CbteFch === s.issuedOn.replace(/-/g, "");
}

export class WsfeClient implements FiscalGateway {
  constructor(private readonly options: { environment: FiscalEnvironment; cuit: string;
    ticket: () => Promise<{ token: string; sign: string }>; fetcher?: typeof fetch }) {}

  private assertContext(s: FiscalSnapshot) {
    if (s.environment !== this.options.environment || s.issuer.cuit !== this.options.cuit || !isFiscalPointOfSaleAllowed(s.pointOfSale, s.environment) || s.voucherType !== 11) throw new Error("Entorno, CUIT o punto de venta inconsistentes.");
  }
  private async request(operation: string, s: FiscalSnapshot, content = "") {
    this.assertContext(s);
    const ticket = await this.options.ticket();
    const xml = envelope(`<${operation} xmlns="${WSFE_NAMESPACE}">${authXml(this.options.cuit, ticket.token, ticket.sign)}${content}</${operation}>`);
    return parseSoapResult(await soapPost(ENDPOINTS[this.options.environment].wsfe, `${WSFE_NAMESPACE}${operation}`, xml, this.options.fetcher), operation);
  }
  async check(s: FiscalSnapshot) {
    const pv = await this.request("FEParamGetPtosVenta", s); requireNoErrors(pv);
    const match = list(pv.ResultGet?.PtoVenta).find((item: any) => Number(item.Nro) === s.pointOfSale) as any;
    if (!match || match.EmisionTipo !== "CAE" || match.Bloqueado !== "N" || (match.FchBaja && match.FchBaja !== "NULL")) throw new Error("El punto de venta no esta activo para CAE via Web Services.");
    const types = await this.request("FEParamGetTiposCbte", s); requireNoErrors(types);
    if (!list(types.ResultGet?.CbteTipo).some((item: any) => Number(item.Id) === 11)) throw new Error("Factura C no esta habilitada.");
    const iva = await this.request("FEParamGetCondicionIvaReceptor", s, "<Cmp_Clase>C</Cmp_Clase>"); requireNoErrors(iva);
    if (!list(iva.ResultGet?.CondicionIvaReceptor).some((item: any) => Number(item.Id) === s.receiver.ivaCondition && String(item.Cmp_Clase).includes("C"))) throw new Error("Condicion IVA del receptor no habilitada para Factura C.");
    const optional = await this.request("FEParamGetTiposOpcional", s); requireNoErrors(optional);
    if (!list(optional.ResultGet?.OpcionalTipo).some((item: any) => Number(item.Id) === 23)) throw new Error("La referencia de recuperacion fiscal no esta disponible en este entorno.");
  }
  async last(s: FiscalSnapshot) {
    const result = await this.request("FECompUltimoAutorizado", s, `<PtoVta>${s.pointOfSale}</PtoVta><CbteTipo>11</CbteTipo>`);
    requireNoErrors(result);
    const number = Number(result.CbteNro);
    if (!Number.isInteger(number) || number < 0 || number > 99999999 || Number(result.PtoVta) !== s.pointOfSale || Number(result.CbteTipo) !== 11) throw new Error("Numeracion ARCA invalida.");
    return number;
  }
  async consult(s: FiscalSnapshot, number: number, reference: string) {
    const result = await this.request("FECompConsultar", s, `<FeCompConsReq><CbteTipo>11</CbteTipo><CbteNro>${number}</CbteNro><PtoVta>${s.pointOfSale}</PtoVta></FeCompConsReq>`);
    if (!result.ResultGet && codes(result).length === 1 && codes(result)[0] === 602) return null;
    requireNoErrors(result);
    const data = result.ResultGet;
    const ref = list(data?.Opcionales?.Opcional).find((item: any) => Number(item.Id) === 23) as any;
    if (!data || !matchesIdentity(data, s, number) || Number(data.PtoVta) !== s.pointOfSale || Number(data.CbteTipo) !== 11 ||
      decimalCents(data.ImpTotal) !== s.totalCents || decimalCents(data.ImpNeto) !== s.totalCents ||
      ["ImpIVA", "ImpTrib", "ImpTotConc", "ImpOpEx"].some((field) => decimalCents(data[field]) !== 0) ||
      data.MonId !== "PES" || Number(data.MonCotiz) !== 1 || ref?.Valor !== reference ||
      (data.CondicionIVAReceptorId && Number(data.CondicionIVAReceptorId) !== s.receiver.ivaCondition) ||
      (s.concept !== 1 && (data.FchServDesde !== s.serviceFrom!.replace(/-/g, "") || data.FchServHasta !== s.serviceTo!.replace(/-/g, "") || data.FchVtoPago !== s.paymentDue!.replace(/-/g, "")))) {
      throw new Error("La consulta del numero reservado no coincide con el snapshot fiscal. Requiere conciliacion manual.");
    }
    return authorization(data, number, true);
  }
  async authorize(s: FiscalSnapshot, number: number, reference: string) {
    this.assertContext(s);
    const ticket = await this.options.ticket();
    const result = parseSoapResult(await soapPost(ENDPOINTS[this.options.environment].wsfe, `${WSFE_NAMESPACE}FECAESolicitar`,
      buildAuthorizationXml(s, number, ticket.token, ticket.sign, reference), this.options.fetcher), "FECAESolicitar");
    const header = result.FeCabResp;
    const detail = list(result.FeDetResp?.FECAEDetResponse);
    const data = detail[0] as any;
    const errors = codes(result);
    if (errors.some((code) => code <= 602)) throw new Error("ARCA no confirmo la autorizacion.");
    if (data?.Resultado === "R" || (!data && errors.length)) return { kind: "rejected" as const,
      codes: [...errors, ...list(data?.Observaciones?.Obs).map((obs: any) => Number(obs.Code)).filter(Number.isInteger)] };
    if (!header || header.Resultado !== "A" || Number(header.Cuit) !== Number(s.issuer.cuit) || Number(header.PtoVta) !== s.pointOfSale ||
      Number(header.CbteTipo) !== 11 || Number(header.CantReg) !== 1 || detail.length !== 1 || !matchesIdentity(data, s, number)) throw new Error("Respuesta de autorizacion no coincide con el comprobante.");
    return { kind: "accepted" as const, authorization: authorization(data, number) };
  }
}
