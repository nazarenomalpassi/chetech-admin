import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepairAccessNewOrderWizard } from "@/features/repairs-access/components/repair-access-new-order-wizard";

Object.assign(globalThis, { React });

afterEach(() => vi.useRealTimers());

describe("RepairAccessNewOrderWizard", () => {
  it("prefills intake date with the operational day after UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T01:30:00.000Z"));

    const html = renderToStaticMarkup(
      <RepairAccessNewOrderWizard
        action={async () => undefined}
        customers={[]}
        editing={null}
        onCancel={() => undefined}
      />
    );

    expect(html).toMatch(/name="intakeDate"[^>]*value="2026-09-18"/);
  });
});
