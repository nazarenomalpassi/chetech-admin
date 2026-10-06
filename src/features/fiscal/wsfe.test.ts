import { describe, expect, it } from "vitest";
import { WsfeClient } from "./wsfe";
import { snapshotFixture } from "./fixtures";

const wrapped = (op: string, data: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${op}Response><${op}Result>${data}</${op}Result></${op}Response></s:Body></s:Envelope>`;
function client(response: string) {
  const fetcher: typeof fetch = async () => new Response(response);
  return new WsfeClient({ environment: "homologation", cuit: "20123456786",
    ticket: async () => ({ token: "synthetic", sign: "synthetic" }), fetcher });
}
const result = `<ResultGet><Concepto>2</Concepto><DocTipo>96</DocTipo><DocNro>12345678</DocNro><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20261005</CbteFch><ImpTotal>100.00</ImpTotal><ImpNeto>100.00</ImpNeto><ImpIVA>0</ImpIVA><ImpTrib>0</ImpTrib><ImpOpEx>0</ImpOpEx><ImpTotConc>0</ImpTotConc><MonId>PES</MonId><MonCotiz>1</MonCotiz><FchServDesde>20261001</FchServDesde><FchServHasta>20261005</FchServHasta><FchVtoPago>20261005</FchVtoPago><CondicionIVAReceptorId>5</CondicionIVAReceptorId><Opcionales><Opcional><Id>23</Id><Valor>record-id</Valor></Opcional></Opcionales><Resultado>A</Resultado><EmisionTipo>CAE</EmisionTipo><CodAutorizacion>12345678901234</CodAutorizacion><FchVto>20261015</FchVto><PtoVta>2</PtoVta><CbteTipo>11</CbteTipo></ResultGet>`;

describe("WSFEv1 authorization evidence", () => {
  it("recovers only a CAE matching the complete request and durable reference", async () => {
    const gateway = client(wrapped("FECompConsultar", result));
    expect((await gateway.consult(snapshotFixture(), 1, "record-id"))?.cae).toBe("12345678901234");
  });
  it("does not confuse another invoice with the same amount and receiver", async () => {
    await expect(client(wrapped("FECompConsultar", result)).consult(snapshotFixture(), 1, "other-id")).rejects.toThrow();
  });
  it("returns absence only for official code 602, not a transport/authentication error", async () => {
    expect(await client(wrapped("FECompConsultar", "<Errors><Err><Code>602</Code></Err></Errors>")).consult(snapshotFixture(), 1, "record-id")).toBeNull();
    await expect(client(wrapped("FECompConsultar", "<Errors><Err><Code>601</Code></Err></Errors>")).consult(snapshotFixture(), 1, "record-id")).rejects.toThrow();
  });
  it.each([result.replace("100.00", "99.00"), result.replace("<EmisionTipo>CAE", "<EmisionTipo>CAEA"), result.replace("20261015", "20261345"), result.replace("12345678901234", "0")])("rejects inconsistent consultation evidence", async (data) => {
    await expect(client(wrapped("FECompConsultar", data)).consult(snapshotFixture(), 1, "record-id")).rejects.toThrow();
  });
  it("does not treat Resultado A without a real CAE as authorized", async () => {
    const data = '<FeCabResp><Cuit>20123456786</Cuit><PtoVta>2</PtoVta><CbteTipo>11</CbteTipo><CantReg>1</CantReg><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>2</Concepto><DocTipo>96</DocTipo><DocNro>12345678</DocNro><CbteDesde>1</CbteDesde><CbteHasta>1</CbteHasta><CbteFch>20261005</CbteFch><Resultado>A</Resultado><CAE></CAE></FECAEDetResponse></FeDetResp>';
    await expect(client(wrapped("FECAESolicitar", data)).authorize(snapshotFixture(), 1, "record-id")).rejects.toThrow();
  });
  it("does not accept a different environment's snapshot", async () => {
    await expect(client(wrapped("FECompUltimoAutorizado", "<CbteNro>0</CbteNro>")).last({ ...snapshotFixture(), environment: "production" })).rejects.toThrow();
  });
  it("reads the counter for explicitly selected homologation PV1", async () => {
    const data = "<PtoVta>1</PtoVta><CbteTipo>11</CbteTipo><CbteNro>0</CbteNro>";
    expect(await client(wrapped("FECompUltimoAutorizado", data)).last({ ...snapshotFixture(), pointOfSale: 1 })).toBe(0);
  });
  it("blocks production PV1 before any SOAP request", async () => {
    let requests = 0;
    const fetcher: typeof fetch = async () => { requests++; return new Response("unexpected"); };
    const gateway = new WsfeClient({ environment: "production", cuit: "20123456786", ticket: async () => ({ token: "synthetic", sign: "synthetic" }), fetcher });
    await expect(gateway.last({ ...snapshotFixture(), environment: "production", pointOfSale: 1 })).rejects.toThrow();
    expect(requests).toBe(0);
  });
  it("validates the live CAE WS point of sale and receiver IVA before authorizing", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (_, init) => {
      const body = String(init?.body); requests.push(body);
      const responses = [
        ["FEParamGetPtosVenta", "<ResultGet><PtoVenta><Nro>2</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja></FchBaja></PtoVenta></ResultGet>"],
        ["FEParamGetTiposCbte", "<ResultGet><CbteTipo><Id>11</Id></CbteTipo></ResultGet>"],
        ["FEParamGetCondicionIvaReceptor", "<ResultGet><CondicionIvaReceptor><Id>5</Id><Cmp_Clase>C</Cmp_Clase></CondicionIvaReceptor></ResultGet>"],
        ["FEParamGetTiposOpcional", "<ResultGet><OpcionalTipo><Id>23</Id></OpcionalTipo></ResultGet>"]
      ];
      const [op, data] = responses.find(([op]) => body.includes(`<${op} `))!;
      return new Response(wrapped(op, data));
    };
    const gateway = new WsfeClient({ environment: "homologation", cuit: "20123456786", ticket: async () => ({ token: "synthetic", sign: "synthetic" }), fetcher });
    await expect(gateway.check(snapshotFixture())).resolves.toBeUndefined();
    expect(requests).toHaveLength(4);
    expect(requests.join(" ")).not.toContain("FECAESolicitar");
    await expect(gateway.check({ ...snapshotFixture(), receiver: { ...snapshotFixture().receiver, ivaCondition: 6 } })).rejects.toThrow();
  });
  it.each([
    "<Nro>1</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado>",
    "<Nro>2</Nro><EmisionTipo>CAEA</EmisionTipo><Bloqueado>N</Bloqueado>",
    "<Nro>2</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>S</Bloqueado>",
    "<Nro>2</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>20260901</FchBaja>"
  ])("fails closed for a different, CAEA, blocked or deregistered PV", async (pv) => {
    await expect(client(wrapped("FEParamGetPtosVenta", `<ResultGet><PtoVenta>${pv}</PtoVenta></ResultGet>`)).check(snapshotFixture())).rejects.toThrow();
  });
});
