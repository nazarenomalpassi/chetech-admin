import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTicketCacheRepository } from "./ticket-repository";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
const scope = { environment: "homologation" as const, cuit: "20123456786", fingerprint: "a".repeat(64), service: "wsfe" as const };

describe("service-only encrypted ticket repository", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.invalid");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-only-key");
    mocks.rpc.mockReset(); mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("uses a nonpersistent service client and sends ciphertext only to the protected RPC", async () => {
    const repository = createTicketCacheRepository();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await repository.publish(scope, "synthetic-lease", { ciphertext: "v1.synthetic-ciphertext", expires: 1000 })).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("wsaa_ticket_publish", { p_input: { ...scope, token: "synthetic-lease", ciphertext: "v1.synthetic-ciphertext", expires: 1000 } });
    expect(mocks.createClient.mock.calls[0][2].auth.persistSession).toBe(false);
  });
  it("bounds cache transport and combines an existing cancellation signal", async () => {
    createTicketCacheRepository();
    let options: RequestInit | undefined;
    const fetcher: typeof fetch = async (_, init) => { options = init; return new Response("ok"); };
    vi.stubGlobal("fetch", fetcher);
    const transport = mocks.createClient.mock.calls[0][2].global.fetch as typeof fetch;
    const controller = new AbortController();
    await transport("https://synthetic.invalid", { signal: controller.signal });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(options?.signal?.aborted).toBe(true);
  });
  it.each([null, {}, { kind: "acquired", token: "invalid" }, { kind: "cached", ciphertext: "v1.fake", expires: "1000" }])("rejects malformed claim responses: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(createTicketCacheRepository().claim(scope)).rejects.toThrow();
  });
  it("sanitizes database/network errors without exposing service credentials or remote contents", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "SECRET_REMOTE_CONTENTS" } });
    await expect(createTicketCacheRepository().claim(scope)).rejects.toThrow(/compartido/);
    await expect(createTicketCacheRepository().claim(scope)).rejects.not.toThrow(/SECRET_REMOTE_CONTENTS|synthetic-service-only-key/);
    mocks.rpc.mockRejectedValue(new Error("SECRET_REMOTE_CONTENTS"));
    await expect(createTicketCacheRepository().claim(scope)).rejects.not.toThrow(/SECRET_REMOTE_CONTENTS/);
  });
});
