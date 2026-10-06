// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSplitFields } from "./payment-split-fields";

describe("payment amount synchronization", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("keeps the existing full-amount behavior for sales by default", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PaymentSplitFields payments={[{ method: "nx", amount: 100 }]} totalAmount={100} onChange={onChange} />);
    rerender(<PaymentSplitFields payments={[{ method: "nx", amount: 100 }]} totalAmount={200} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ method: "nx", amount: 200 }]);
  });
  it("never turns loading or editing a repair quote into an assumed full collection", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PaymentSplitFields payments={[{ method: "efectivo", amount: 0 }]} totalAmount={0} onChange={onChange} syncAmountWithTotal={false} />);
    rerender(<PaymentSplitFields payments={[{ method: "efectivo", amount: 0 }]} totalAmount={80000} onChange={onChange} syncAmountWithTotal={false} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ method: "efectivo", amount: 0 }]);
  });
  it("fills a remaining split with exactly two decimal places", () => {
    const onChange = vi.fn();
    render(<PaymentSplitFields payments={[{ method: "nx", amount: 30.10 }]} totalAmount={100.30} onChange={onChange} syncAmountWithTotal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar medio" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([{ method: "nx", amount: 30.10 }, { method: "efectivo", amount: 70.20 }]);
  });
});
