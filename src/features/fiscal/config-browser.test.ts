// @vitest-environment jsdom
import { expect, it } from "vitest";
import { readFiscalConfig } from "./config";

it("refuses to read private issuer or PEM configuration in a browser runtime", () => {
  expect(() => readFiscalConfig({ ARCA_ISSUER_CUIT: "20123456786" })).toThrow(/servidor/i);
});
