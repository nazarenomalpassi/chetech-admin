import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import { getServerActionRequestMetadata } from "next/dist/server/lib/server-action-request-meta";
import config from "./next.config";

const contextParameters = [
  "status", "error", "q", "state", "warranty", "scope", "cursor", "from", "to",
];

describe("legacy printed QR routing", () => {
  it("stays within the deployment platform's 16-condition routing limit", async () => {
    const result = await config.rewrites?.();
    const rules = result && !Array.isArray(result) ? result.beforeFiles ?? [] : [];
    expect(rules[0].missing?.length ?? 0).toBeLessThanOrEqual(16);
  });
  it("rewrites old detail links before private layout for full document scans only", async () => {
    const result = await config.rewrites?.();
    const rules = result && !Array.isArray(result) ? result.beforeFiles : [];
    expect(rules).toContainEqual({
      source: "/reparaciones-access",
      has: [
        { type: "query", key: "view", value: "detalle" },
        {
          type: "query",
          key: "order",
          value:
            "(?<legacyRepairQrId>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        },
      ],
      missing: [
        { type: "header", key: "rsc" },
        { type: "header", key: "next-action" },
        { type: "header", key: "content-type" },
        ...contextParameters.map((key) => ({ type: "query", key })),
      ],
      destination: "/q/:legacyRepairQrId",
    });
  });
  it.each(["rsc", "next-action", "content-type"])(
    "excludes requests carrying the %s header from the legacy rewrite",
    async (key) => {
      const result = await config.rewrites?.();
      const rules =
        result && !Array.isArray(result) ? (result.beforeFiles ?? []) : [];
      expect(rules).toHaveLength(1);
      expect(rules[0].missing).toContainEqual({ type: "header", key });
    },
  );
});

describe("legacy QR framework request matching", () => {
  const id = "00000000-0000-4000-8000-000000000742";
  const query = { view: "detalle", order: id };

  async function matchRequest(
    method: string,
    headers: Record<string, string>,
    context: Record<string, string> = {},
  ) {
    const result = await config.rewrites?.();
    const rules =
      result && !Array.isArray(result) ? (result.beforeFiles ?? []) : [];
    expect(rules).toHaveLength(1);
    return matchHas(
      { method, headers } as IncomingMessage,
      { ...query, ...context },
      rules[0].has,
      rules[0].missing,
    );
  }

  it.each(["GET", "HEAD"])(
    "matches a legacy %s document scan and extracts the order UUID",
    async (method) => {
      expect(
        await matchRequest(method, {
          accept: "text/html",
          "sec-fetch-dest": "document",
        }),
      ).toMatchObject({ legacyRepairQrId: id });
    },
  );

  it("does not match ordinary RSC soft navigation", async () => {
    expect(await matchRequest("GET", { rsc: "1" })).toBe(false);
  });

  it.each(contextParameters)(
    "preserves a full-document GET carrying application context %s",
    async (key) => {
      expect(
        await matchRequest("GET", { accept: "text/html" }, { [key]: "retained-value" }),
      ).toBe(false);
    },
  );

  it("does not rewrite a Server Action GET redirect with messages and filters", async () => {
    expect(
      await matchRequest("GET", { accept: "text/html" }, {
        status: "repair_access_technical_updated",
        error: "Keep this error message",
        q: "Samsung",
        cursor: "saved-cursor",
      }),
    ).toBe(false);
  });

  const actionHeaders: [string, Record<string, string>][] = [
    [
      "fetch action without Content-Type",
      { "next-action": "test-action", accept: "text/x-component" },
    ],
    [
      "fetch action with a string body",
      { "next-action": "test-action", "content-type": "text/plain;charset=UTF-8" },
    ],
    [
      "native multipart form without Next-Action",
      { "content-type": "multipart/form-data; boundary=test-boundary" },
    ],
    [
      "native URL-encoded form without Next-Action",
      { "content-type": "application/x-www-form-urlencoded" },
    ],
  ];

  it.each(actionHeaders)(
    "leaves the framework's %s POST on the application route",
    async (_name, headers) => {
      const request = { method: "POST", headers } as IncomingMessage;
      expect(
        getServerActionRequestMetadata(request).isPossibleServerAction,
      ).toBe(true);
      expect(await matchRequest("POST", headers)).toBe(false);
    },
  );

  it("does not recognize a POST lacking both action headers as a Server Action", () => {
    const request = { method: "POST", headers: {} } as IncomingMessage;
    expect(getServerActionRequestMetadata(request).isPossibleServerAction).toBe(
      false,
    );
  });
});
