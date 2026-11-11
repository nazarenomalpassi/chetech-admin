import { describe, expect, it } from "vitest";
import {
  buildRepairQrUrl,
  getPrivateRepairPath,
  getLegacyRepairQrId,
} from "./repair-qr-links";
const id = "00000000-0000-4000-8000-000000000742";
describe("repair QR links", () => {
  it.each([
    "status=saved",
    "error=failed",
    "q=Bel%C3%A9n",
    "cursor=next",
    "state=en_revision",
  ])(
    "preserves application context rather than treating it as a scan: %s",
    (query) => {
      expect(
        getLegacyRepairQrId(
          "GET",
          new URL(
            `https://gestion.example.com/reparaciones-access?view=detalle&order=${id}&${query}`,
          ),
          new Headers(),
        ),
      ).toBeNull();
    },
  );
  it.each(["GET", "HEAD"])(
    "recognizes an old full-document QR for %s",
    (method) => {
      expect(
        getLegacyRepairQrId(
          method,
          new URL(
            `https://gestion.example.com/reparaciones-access?view=detalle&order=${id}`,
          ),
          new Headers(),
        ),
      ).toBe(id);
    },
  );
  it.each([
    ["POST", {}],
    ["GET", { rsc: "1" }],
    ["POST", { "next-action": "action-id" }],
    ["POST", { "content-type": "multipart/form-data; boundary=demo" }],
  ] as const)(
    "does not turn actions or RSC into a scan: %s %j",
    (method, headers) => {
      expect(
        getLegacyRepairQrId(
          method,
          new URL(
            `https://gestion.example.com/reparaciones-access?view=detalle&order=${id}`,
          ),
          new Headers(headers),
        ),
      ).toBeNull();
    },
  );
  it.each([
    "/reparaciones-access?view=ordenes",
    "/dashboard?view=detalle",
    "/reparaciones-access?view=detalle&order=bad",
  ])("does not expose other entries as public scans: %s", (path) => {
    expect(
      getLegacyRepairQrId(
        "GET",
        new URL(`https://gestion.example.com${path}`),
        new Headers(),
      ),
    ).toBeNull();
  });
  it("contains only the immutable UUID, never a REP or a personal detail", () => {
    expect(buildRepairQrUrl(id, "https://chetech-admin.vercel.app")).toBe(
      `https://chetech-admin.vercel.app/q/${id}`,
    );
  });
  it("preserves a configured origin while discarding base path and arbitrary queries", () => {
    expect(
      buildRepairQrUrl(
        id,
        "https://gestion.example.com/base?next=https://evil.test",
      ),
    ).toBe(`https://gestion.example.com/q/${id}`);
    expect(getPrivateRepairPath(id)).toBe(`/reparaciones-access/orden/${id}`);
  });
  it.each(["bad", "//evil.test", "../dashboard"])(
    "refuses an unsafe order identifier %s",
    (value) => {
      expect(() =>
        buildRepairQrUrl(value, "https://gestion.example.com"),
      ).toThrow();
      expect(() => getPrivateRepairPath(value)).toThrow();
    },
  );
});
