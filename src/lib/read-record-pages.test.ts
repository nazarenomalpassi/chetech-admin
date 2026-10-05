import { describe, expect, it, vi } from "vitest";
import { readRecordPages } from "@/lib/read-record-pages";

describe("complete paged reads", () => {
  it("does not truncate records after the first full page", async () => {
    const records = Array.from({ length: 507 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({ data: records.slice(from, to + 1), error: null }));
    expect(await readRecordPages(fetchPage)).toEqual(records);
    expect(fetchPage.mock.calls).toEqual([[0, 499], [500, 999]]);
  });
  it("does not accept a partial history when a later page fails", async () => {
    await expect(readRecordPages(async (from) => from === 0 ? { data: [1, 2], error: null } : { data: null, error: { message: "Connection lost" } }, 2)).rejects.toThrow("Connection lost");
  });
  it("finishes an exact page boundary without duplication", async () => {
    expect(await readRecordPages(async (from) => ({ data: from ? [] : [1, 2], error: null }), 2)).toEqual([1, 2]);
  });
  it("deduplicates identities when a concurrent insertion shifts page offsets", async () => {
    const pages = [[{ id: "3" }, { id: "2" }], [{ id: "2" }, { id: "1" }], []];
    const result = await readRecordPages(async (from) => ({ data: pages[from / 2], error: null }), 2, (row) => row.id);
    expect(result.map(row => row.id)).toEqual(["3", "2", "1"]);
  });
});
