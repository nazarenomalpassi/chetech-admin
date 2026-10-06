import { describe, expect, it } from "vitest";
import { buildAuthorizationXml, escapeXml, parseSoapResult, soapPost } from "./xml";
import { snapshotFixture as snapshot } from "./fixtures";

describe("ARCA SOAP security and wire format", () => {
  it("escapes every XML metacharacter and rejects invalid control characters", () => {
    expect(escapeXml('<a&b>\"\'')).toBe("&lt;a&amp;b&gt;&quot;&apos;");
    expect(() => escapeXml("a\u0000b")).toThrow();
  });
  it("sends one C voucher, zero IVA and net equal to total after discount", () => {
    const xml = buildAuthorizationXml(snapshot(), 4, "token<&", "sign", "reference-id");
    expect(xml).toContain("<CbteTipo>11</CbteTipo>");
    expect(xml).toContain("<ImpNeto>100.00</ImpNeto>");
    expect(xml).toContain("<ImpIVA>0.00</ImpIVA>");
    expect(xml).toContain("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>");
    expect(xml).toContain("<FchServDesde>20261001</FchServDesde>");
    expect(xml).toContain("<Id>23</Id><Valor>reference-id</Valor>");
    expect(xml).toContain("token&lt;&amp;");
    expect(xml).not.toContain("<Iva>");
  });
  it("preserves CAE and document strings including leading zeroes", () => {
    const result = parseSoapResult('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse><FECompConsultarResult><ResultGet><CodAutorizacion>01234567890123</CodAutorizacion></ResultGet></FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>', "FECompConsultar");
    expect(result.ResultGet.CodAutorizacion).toBe("01234567890123");
  });
  it("rejects entities, DTD, malformed XML and SOAP faults without echoing secret contents", () => {
    for (const xml of ['<!DOCTYPE x [<!ENTITY secret "private-key">]><x>&secret;</x>', '<x>', '<Envelope><Body><Fault><faultstring>secret-token</faultstring></Fault></Body></Envelope>']) {
      expect(() => parseSoapResult(xml, "FECompConsultar")).toThrow();
      try { parseSoapResult(xml, "FECompConsultar"); } catch (e) { expect(String(e)).not.toContain("secret-token"); }
    }
  });
  it("sets timeout and forbids redirects when transmitting credentials", async () => {
    let options: RequestInit | undefined;
    const fetcher: typeof fetch = async (_, init) => { options = init; return new Response("ok"); };
    expect(await soapPost("https://wswhomo.afip.gov.ar/wsfev1/service.asmx", "test", "xml", fetcher)).toBe("ok");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
});
