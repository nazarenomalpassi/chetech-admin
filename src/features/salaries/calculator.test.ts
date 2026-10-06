import { describe, expect, it } from "vitest";

import { calculateFundingPlan, calculateSalaryPlan } from "@/features/salaries/calculator";

const MEMBERS = [
  { id: "nazareno", name: "Nazareno", targetAmount: 800_000, paidAmount: 0 },
  { id: "matias", name: "Matias Grandi", targetAmount: 300_000, paidAmount: 0 },
  { id: "juanma", name: "Juanma Pitaro", targetAmount: 300_000, paidAmount: 0 },
  { id: "santiago", name: "Santiago Pitaro", targetAmount: 300_000, paidAmount: 0 }
];

describe("calculateSalaryPlan", () => {
  it("distribuye el 100 por ciento segun cada sueldo objetivo", () => {
    const plan = calculateSalaryPlan(MEMBERS, 1_700_000);

    expect(plan.coveragePercentage).toBe(100);
    expect(plan.members.map((member) => member.amountDueNow)).toEqual([800_000, 300_000, 300_000, 300_000]);
    expect(plan.batchTotal).toBe(1_700_000);
  });

  it("distribuye 850000 como el 50 por ciento de cada objetivo", () => {
    const plan = calculateSalaryPlan(MEMBERS, 850_000);

    expect(plan.coveragePercentage).toBe(50);
    expect(plan.members.map((member) => member.amountDueNow)).toEqual([400_000, 150_000, 150_000, 150_000]);
  });

  it("distribuye 1360000 como el 80 por ciento de cada objetivo", () => {
    const plan = calculateSalaryPlan(MEMBERS, 1_360_000);

    expect(plan.coveragePercentage).toBe(80);
    expect(plan.members.map((member) => member.amountDueNow)).toEqual([640_000, 240_000, 240_000, 240_000]);
  });

  it("limita salarios al 100 por ciento y separa el excedente", () => {
    const plan = calculateSalaryPlan(MEMBERS, 2_000_000);

    expect(plan.salaryAmount).toBe(1_700_000);
    expect(plan.excessAmount).toBe(300_000);
    expect(plan.members.map((member) => member.profitShareAmount)).toEqual([75_000, 75_000, 75_000, 75_000]);
    expect(plan.members.map((member) => member.totalAmount)).toEqual([875_000, 375_000, 375_000, 375_000]);
    expect(plan.batchTotal).toBe(2_000_000);
  });

  it("distribuye un excedente de un millon en partes iguales", () => {
    const plan = calculateSalaryPlan(MEMBERS, 2_700_000);

    expect(plan.salaryAmount).toBe(1_700_000);
    expect(plan.excessAmount).toBe(1_000_000);
    expect(plan.members.map((member) => member.profitShareAmount)).toEqual([250_000, 250_000, 250_000, 250_000]);
    expect(plan.members.map((member) => member.totalAmount)).toEqual([1_050_000, 550_000, 550_000, 550_000]);
  });

  it("completa el salario pendiente antes de repartir excedente", () => {
    const membersWithEightyPercentPaid = MEMBERS.map((member) => ({
      ...member,
      paidAmount: member.targetAmount * 0.8
    }));

    const plan = calculateSalaryPlan(membersWithEightyPercentPaid, 500_000);

    expect(plan.salaryAmount).toBe(340_000);
    expect(plan.excessAmount).toBe(160_000);
    expect(plan.members.map((member) => member.salaryAmount)).toEqual([160_000, 60_000, 60_000, 60_000]);
    expect(plan.members.map((member) => member.profitShareAmount)).toEqual([40_000, 40_000, 40_000, 40_000]);
    expect(plan.members.map((member) => member.totalAmount)).toEqual([200_000, 100_000, 100_000, 100_000]);
    expect(plan.members.map((member) => member.remainingAfterPayment)).toEqual([0, 0, 0, 0]);
    expect(plan.batchTotal).toBe(500_000);
  });
});

describe("calculateFundingPlan", () => {
  const accounts = [
    { method: "efectivo", balance: 900_000, amount: 500_000 },
    { method: "nx", balance: 500_000, amount: 400_000 },
    { method: "mp", balance: 1_200_000, amount: 1_100_000 }
  ];

  it("acepta una asignacion exacta entre varias cuentas", () => {
    const funding = calculateFundingPlan(accounts, 2_000_000);

    expect(funding.assignedAmount).toBe(2_000_000);
    expect(funding.differenceAmount).toBe(0);
    expect(funding.isBalanced).toBe(true);
    expect(funding.hasOverdrawnAccount).toBe(false);
  });

  it("rechaza una asignacion incompleta", () => {
    const funding = calculateFundingPlan(
      accounts.map((account) => account.method === "mp" ? { ...account, amount: 1_000_000 } : account),
      2_000_000
    );

    expect(funding.differenceAmount).toBe(100_000);
    expect(funding.isBalanced).toBe(false);
  });

  it("rechaza retirar mas que el saldo de una cuenta", () => {
    const funding = calculateFundingPlan([
      { method: "efectivo", balance: 900_000, amount: 0 },
      { method: "nx", balance: 500_000, amount: 0 },
      { method: "mp", balance: 1_200_000, amount: 2_000_000 }
    ], 2_000_000);

    expect(funding.isBalanced).toBe(false);
    expect(funding.hasOverdrawnAccount).toBe(true);
  });
});
