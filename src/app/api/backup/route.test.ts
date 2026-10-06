import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), service: vi.fn(), export: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("./operational-export", () => ({ createOperationalExport: mocks.export, readExportTable: mocks.read }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.service }));
import { GET } from "./route";
import * as XLSX from "xlsx";
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ role: "admin" }); mocks.client.mockResolvedValue({}); mocks.service.mockReturnValue({ private: true }); mocks.read.mockResolvedValue([]); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://unit.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret"); });
afterEach(() => vi.unstubAllEnvs());
describe("backup export route", () => {
  it("exports private JSON only for admins with an explicit format", async () => {
    mocks.export.mockResolvedValue({ format: "chetech-operational-export", manifest: { fullDatabaseBackup: false } });
    const response = await GET(new Request("https://test/api/backup?format=json"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect((await response.json()).manifest.fullDatabaseBackup).toBe(false);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.export).toHaveBeenCalledWith({ private: true }, expect.any(Object));
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("refuses an incomplete JSON export when server service credentials are not configured", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await GET(new Request("https://test/api/backup?format=json"));
    expect(response.status).toBe(503);
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.export).not.toHaveBeenCalled();
  });
  it("returns the complete serialized JSON at the exact 4 MiB HTTP boundary", async () => {
    const limit = 4 * 1024 * 1024;
    const artifact = { manifest: { fullDatabaseBackup: false }, data: "" };
    artifact.data = "a".repeat(limit - Buffer.byteLength(JSON.stringify(artifact), "utf8"));
    mocks.export.mockResolvedValue(artifact);
    const response = await GET(new Request("https://test/api/backup?format=json"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(Buffer.byteLength(body, "utf8")).toBe(limit);
    expect(body).toBe(JSON.stringify(artifact));
    expect(response.headers.get("content-disposition")).toContain("attachment;");
  });
  it("refuses 4 MiB plus one byte with a private CLI instruction, never a partial attachment", async () => {
    const limit = 4 * 1024 * 1024;
    const artifact = { manifest: { fullDatabaseBackup: false }, data: "private operational rows" };
    artifact.data += "a".repeat(limit + 1 - Buffer.byteLength(JSON.stringify(artifact), "utf8"));
    mocks.export.mockResolvedValue(artifact);
    const response = await GET(new Request("https://test/api/backup?format=json"));
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    const body = await response.text();
    expect(body).toContain("CLI privado");
    expect(body).toContain("scripts/backup-export.ts");
    expect(body).not.toContain("private operational rows");
    expect(JSON.parse(body)).not.toHaveProperty("manifest");
    expect(JSON.parse(body)).not.toHaveProperty("data");
  });
  it("measures UTF-8 bytes rather than JavaScript characters", async () => {
    const artifact = { data: "\u00e1".repeat(2 * 1024 * 1024) };
    expect(JSON.stringify(artifact).length).toBeLessThan(4 * 1024 * 1024);
    mocks.export.mockResolvedValue(artifact);
    const response = await GET(new Request("https://test/api/backup?format=json"));
    expect(response.status).toBe(413);
    expect(response.headers.get("content-disposition")).toBeNull();
  });
  it("keeps the seven legacy Excel sheets and identifies their limited scope", async () => {
    const response = await GET(new Request("https://test/api/backup"));
    const workbook = XLSX.read(await response.arrayBuffer());
    expect(workbook.SheetNames).toEqual(["Productos", "Ventas", "Items venta", "Gastos", "Reparaciones", "Facturacion", "Caja", "Alcance"]);
    expect(mocks.read).toHaveBeenCalledTimes(7);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns no partial JSON on failure and never echoes database details", async () => {
    mocks.export.mockRejectedValue(new Error("secret database details"));
    const response = await GET(new Request("https://test/api/backup?format=json"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
  it("rejects unknown formats before reading any operational data", async () => {
    const response = await GET(new Request("https://test/api/backup?format=sql"));
    expect(response.status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("does not access data when authorization fails", async () => {
    mocks.admin.mockRejectedValue(new Error("forbidden"));
    await expect(GET(new Request("https://test/api/backup?format=json"))).rejects.toThrow("forbidden");
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
