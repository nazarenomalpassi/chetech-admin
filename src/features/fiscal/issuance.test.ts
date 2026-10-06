import { describe, expect, it } from "vitest";
import { issueFiscalInvoice, snapshotHash, type FiscalGateway, type FiscalRepository } from "./issuance";
import { snapshotFixture } from "./fixtures";
import type { FiscalAuthorization, FiscalRecord, FiscalStatus } from "./model";

const authorization: FiscalAuthorization = { cae: "12345678901234", expiresOn: "2026-10-15", number: 1, observationCodes: [] };
function scenario(status: FiscalStatus = "claimed") {
  const events: string[] = [];
  const record: FiscalRecord = { id: "00000000-0000-4000-8000-000000000030", invoiceId: snapshotFixture().invoiceId,
    snapshot: snapshotFixture(), snapshotHash: snapshotHash(snapshotFixture()), status, number: status === "claimed" ? null : 1,
    authorization: status === "accepted" ? authorization : null, errorCodes: [] };
  let locked = false;
  const repository: FiscalRepository = {
    async claim() {
      if (record.status === "accepted") return { kind: "accepted", record };
      if (locked) return { kind: "busy", record };
      locked = true; return { kind: "acquired", record, token: "claim-token" };
    },
    async prepare(_id, _token, number) { events.push("prepare"); record.number = number; record.status = "prepared"; return { ...record }; },
    async markSubmitting() { events.push("submitting"); record.status = "submitting"; },
    async finish(_id, _token, outcome) { events.push(outcome.status); record.status = outcome.status;
      record.authorization = outcome.authorization ?? null; locked = false; return { ...record }; }
  };
  const gateway: FiscalGateway = {
    async check() { events.push("check"); }, async last() { events.push("last"); return 0; },
    async consult() { events.push("consult"); return null; },
    async authorize() { events.push("authorize"); return { kind: "accepted", authorization }; }
  };
  const run = () => issueFiscalInvoice(repository, gateway, { requestId: record.id, userId: record.id,
    snapshot: snapshotFixture(), snapshotHash: record.snapshotHash });
  return { repository, gateway, record, events, run };
}

describe("manual fiscal issuance orchestration", () => {
  it("persists the reserved number and submitting state before authorization", async () => {
    const s = scenario();
    expect((await s.run()).status).toBe("accepted");
    expect(s.events).toEqual(["check", "last", "prepare", "consult", "last", "submitting", "authorize", "accepted"]);
  });
  it("returns a previously accepted record without contacting ARCA", async () => {
    const s = scenario("accepted");
    expect((await s.run()).authorization?.cae).toBe(authorization.cae);
    expect(s.events).toEqual([]);
  });
  it("claims serially so simultaneous confirms never send two requests", async () => {
    const s = scenario();
    await Promise.all([s.run(), s.run()]);
    expect(s.events.filter((e) => e === "authorize")).toHaveLength(1);
  });
  it("retains an uncertain reservation on a lost response", async () => {
    const s = scenario();
    s.gateway.authorize = async () => { throw new Error("secret-token timeout"); };
    const result = await s.run();
    expect(result.status).toBe("uncertain");
    expect(result.number).toBe(1);
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
  it("recovers a CAE by consulting before any retry", async () => {
    const s = scenario("uncertain");
    s.gateway.consult = async () => { s.events.push("consult"); return authorization; };
    expect((await s.run()).status).toBe("accepted");
    expect(s.events).not.toContain("authorize");
    expect(s.events).not.toContain("prepare");
  });
  it("recovers an existing CAE even if the PV is no longer ready for a new authorization", async () => {
    const s = scenario("uncertain");
    s.gateway.check = async () => { throw new Error("PV blocked for new issuance"); };
    s.gateway.consult = async () => authorization;
    expect((await s.run()).status).toBe("accepted");
  });
  it("retries only the same reserved number after a confirmed absence and last-number check", async () => {
    const s = scenario("uncertain");
    expect((await s.run()).number).toBe(1);
    expect(s.events.indexOf("consult")).toBeLessThan(s.events.indexOf("authorize"));
    expect(s.events).not.toContain("prepare");
  });
  it("does not issue when another system consumed the reserved number", async () => {
    const s = scenario("uncertain");
    s.gateway.last = async () => 2;
    expect((await s.run()).status).toBe("uncertain");
    expect(s.events).not.toContain("authorize");
  });
  it("does not release the series when recovery itself fails", async () => {
    const s = scenario("uncertain");
    s.gateway.consult = async () => { throw new Error("Unavailable"); };
    expect((await s.run()).status).toBe("uncertain");
    expect(s.events).not.toContain("authorize");
  });
  it("consults again after rejection to detect an earlier accepted response", async () => {
    const s = scenario("uncertain"); let calls = 0;
    s.gateway.consult = async () => ++calls === 1 ? null : authorization;
    s.gateway.authorize = async () => ({ kind: "rejected", codes: [10016] });
    expect((await s.run()).status).toBe("accepted");
  });
  it("fingerprints document content but not mutable cash balances", () => {
    expect(snapshotHash(snapshotFixture())).toBe(snapshotHash(snapshotFixture()));
    expect(snapshotHash({ ...snapshotFixture(), totalCents: 9999 })).not.toBe(snapshotHash(snapshotFixture()));
  });
});
