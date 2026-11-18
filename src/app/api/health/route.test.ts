import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("health check", () => {
  it("answers without touching the database and is never cached", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
