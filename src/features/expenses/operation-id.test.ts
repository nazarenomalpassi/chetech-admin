import { describe, expect, it } from "vitest";
import * as operations from "./operation-id";

describe("durable expense operation identity", () => {
  it("keeps one UUID for unchanged retries after remount, not the payment fields", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
    const form = new FormData();
    form.set("description", "Private supplier detail");
    form.set("amount", "100");
    const first = await operations.getExpenseOperationId(form, "owner", "new", storage);
    expect(await operations.getExpenseOperationId(form, "owner", "new", storage)).toBe(first);
    expect([...values.values()].join()).not.toContain("Private supplier detail");
    expect(await operations.getExpenseOperationId(form, "another-owner", "new", storage)).not.toBe(first);
    form.set("amount", "101");
    const changed = await operations.getExpenseOperationId(form, "owner", "new", storage);
    expect(changed).not.toBe(first);
    operations.acknowledgeExpenseOperation("owner", "new", first, storage);
    expect(await operations.getExpenseOperationId(form, "owner", "new", storage)).toBe(changed);
    operations.acknowledgeExpenseOperation("owner", "new", changed, storage);
    expect(await operations.getExpenseOperationId(form, "owner", "new", storage)).not.toBe(changed);
  });
});
