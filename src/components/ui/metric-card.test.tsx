import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Wallet } from "lucide-react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "@/components/ui/metric-card";

Object.assign(globalThis, { React });
describe("semantic metrics", () => {
  it("renders a financial label, formatted value and explanatory context", () => {
    const html = renderToStaticMarkup(<MetricCard label="Ventas" value={15000} format="currency" icon={Wallet} tone="income" description="Ingresos del periodo" />);
    expect(html).toContain("15.000,00");
    expect(html).toContain("Ingresos del periodo");
    expect(html).toContain('data-tone="income"');
    expect(html).toContain('aria-hidden="true"');
  });
  it("does not display a negative financial result as success", () => {
    const html = renderToStaticMarkup(<MetricCard label="Flujo neto de caja" value={-3200} format="currency" icon={Wallet} tone="success" />);
    expect(html).toContain('data-tone="expense"');
    expect(html).toContain("3.200,00");
  });
  it("supports operational counts without currency or invented trend indicators", () => {
    const html = renderToStaticMarkup(<MetricCard label="Ordenes" value={42} icon={Wallet} tone="service" />);
    expect(html).toContain(">42<");
    expect(html).not.toContain("$");
    expect(html).not.toContain("%");
  });
});
