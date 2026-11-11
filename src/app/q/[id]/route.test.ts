import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ response: vi.fn() }));
vi.mock("@/features/repairs-access/qr-gateway", () => ({
  getRepairQrResponse: mocks.response,
}));
import { GET, dynamic, runtime } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.response.mockResolvedValue(new Response("CHETECH"));
});
describe("QR endpoint", () => {
  it("uses a dynamic request-scoped handler without trusting next, host or an asserted role", async () => {
    const id = "00000000-0000-4000-8000-000000000742";
    const request = new Request(
      `https://untrusted.test/q/${id}?next=https://evil.test&role=admin`,
    );
    await GET(request, { params: Promise.resolve({ id }) });
    expect(mocks.response).toHaveBeenCalledExactlyOnceWith(id);
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
  });
});
