import { describe, expect, it } from "vitest";
import { tvBoardSaleCommandSchema } from "./claims";

const command = { id: "11111111-1111-4111-8111-111111111111", version: 1, operationId: "22222222-2222-4222-8222-222222222222", kind: "start_claim", notes: "Cliente abrio un reclamo" };
describe("TV board claim commands", () => {
  it.each(["start_claim", "resume_sale", "cancel_sale", "confirm_release"])("accepts %s", (kind) => {
    expect(tvBoardSaleCommandSchema.safeParse({ ...command, kind }).success).toBe(true);
  });
  it.each([{ version: 0 }, { version: 1.5 }, { operationId: "" }, { kind: "delete" }, { notes: "x".repeat(1001) }])("rejects invalid command %j", (patch) => {
    expect(tvBoardSaleCommandSchema.safeParse({ ...command, ...patch }).success).toBe(false);
  });
});
