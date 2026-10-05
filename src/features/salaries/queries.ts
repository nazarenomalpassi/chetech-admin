import type { SalaryPlanningData } from "@/features/salaries/types";
import { normalizeCashMethodValue } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function getArgentinaMonthString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function normalizeSalaryMonth(value?: string) {
  if (!value || !MONTH_PATTERN.test(value)) return getArgentinaMonthString();
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12 ? value : getArgentinaMonthString();
}

export function formatSalaryMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 15, 12))
  );
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function emptyData(monthKey: string): SalaryPlanningData {
  return {
    migrationReady: false,
    periodMonth: `${monthKey}-01`,
    monthKey,
    monthLabel: formatSalaryMonth(monthKey),
    accounts: [],
    totalAvailable: 0,
    members: [],
    reserves: [],
    merchandise: { quantitySold: 0, revenue: 0, historicalCost: 0, currentReplacementCost: 0, grossMargin: 0 },
    suggestedSalaryAmount: 0,
    liquidations: [],
    withdrawals: []
  };
}

export async function getSalaryPlanningData(requestedMonth?: string): Promise<SalaryPlanningData> {
  const monthKey = normalizeSalaryMonth(requestedMonth);
  const supabase = await createServerSupabaseClient();
  const [planningResult, profitShareResult] = await Promise.all([
    (supabase as any).rpc("get_salary_planning_snapshot", { p_period_month: `${monthKey}-01` }),
    (supabase as any).rpc("get_salary_profit_share_snapshot", { p_period_month: `${monthKey}-01` })
  ]);
  const { data, error } = planningResult;

  if (error) {
    if (error.code === "42883" || error.code === "42P01" || error.message?.includes("schema cache")) {
      return emptyData(monthKey);
    }
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as Record<string, any>;
  const profitSharePayload = profitShareResult.error ? {} : ((profitShareResult.data ?? {}) as Record<string, any>);
  const paidByMember = new Map(
    (profitSharePayload.member_payments ?? []).map((payment: any) => [
      String(payment.member_id),
      {
        salaryPaid: numberValue(payment.salary_paid),
        profitSharePaid: numberValue(payment.profit_share_paid)
      }
    ])
  );
  const accounts = (payload.accounts ?? []).map((account: any) => ({
    method: normalizeCashMethodValue(account.method) ?? account.method,
    label: String(account.label ?? account.method ?? ""),
    openingBalance: numberValue(account.opening_balance),
    income: numberValue(account.income),
    outcome: numberValue(account.outcome),
    transferDelta: numberValue(account.transfer_delta),
    balance: numberValue(account.balance)
  }));
  const reserves = (payload.reserves ?? []).map((reserve: any) => ({
    id: String(reserve.id),
    code: String(reserve.code),
    name: String(reserve.name),
    amount: numberValue(reserve.amount),
    sortOrder: numberValue(reserve.sort_order)
  }));
  const merchandise = payload.merchandise ?? {};
  const totalAvailable = numberValue(payload.total_available);
  const currentReplacementCost = numberValue(merchandise.current_replacement_cost);
  const reserveTotal = reserves.reduce((total: number, reserve: { amount: number }) => total + reserve.amount, 0);

  return {
    migrationReady: true,
    periodMonth: String(payload.period_month ?? `${monthKey}-01`),
    monthKey,
    monthLabel: formatSalaryMonth(monthKey),
    accounts,
    totalAvailable,
    members: (payload.members ?? []).map((member: any) => {
      const extension = paidByMember.get(String(member.id)) as { salaryPaid: number; profitSharePaid: number } | undefined;
      return {
        id: String(member.id),
        name: String(member.name),
        targetAmount: numberValue(member.target_amount),
        sortOrder: numberValue(member.sort_order),
        paidAmount: extension?.salaryPaid ?? numberValue(member.paid_amount),
        profitSharePaid: extension?.profitSharePaid ?? 0
      };
    }),
    reserves,
    merchandise: {
      quantitySold: numberValue(merchandise.quantity_sold),
      revenue: numberValue(merchandise.revenue),
      historicalCost: numberValue(merchandise.historical_cost),
      currentReplacementCost,
      grossMargin: numberValue(merchandise.gross_margin)
    },
    suggestedSalaryAmount: Math.max(totalAvailable - reserveTotal - currentReplacementCost, 0),
    liquidations: (profitSharePayload.liquidations ?? []).map((liquidation: any) => ({
      id: String(liquidation.id),
      periodMonth: String(liquidation.period_month),
      withdrawalDate: String(liquidation.withdrawal_date),
      intendedTotal: numberValue(liquidation.intended_total),
      salaryMassSnapshot: numberValue(liquidation.salary_mass_snapshot),
      salaryAmount: numberValue(liquidation.salary_amount),
      profitShareAmount: numberValue(liquidation.profit_share_amount),
      totalAmount: numberValue(liquidation.total_amount),
      coveragePercentage: numberValue(liquidation.coverage_percentage),
      notes: String(liquidation.notes ?? ""),
      createdAt: String(liquidation.created_at),
      members: (liquidation.members ?? []).map((member: any) => ({
        memberId: String(member.member_id),
        memberName: String(member.member_name),
        targetAmount: numberValue(member.target_amount),
        salaryAmount: numberValue(member.salary_amount),
        profitShareAmount: numberValue(member.profit_share_amount),
        totalAmount: numberValue(member.total_amount),
        coveragePercentage: numberValue(member.coverage_percentage)
      })),
      funding: (liquidation.funding ?? []).map((funding: any) => ({
        paymentMethod: normalizeCashMethodValue(funding.payment_method) ?? funding.payment_method,
        amount: numberValue(funding.amount)
      }))
    })),
    withdrawals: (payload.withdrawals ?? []).filter((withdrawal: any) => withdrawal.withdrawal_type !== "salary").map((withdrawal: any) => ({
      id: String(withdrawal.id),
      withdrawalDate: String(withdrawal.withdrawal_date),
      amount: numberValue(withdrawal.amount),
      paymentMethod: normalizeCashMethodValue(withdrawal.payment_method) ?? String(withdrawal.payment_method),
      notes: String(withdrawal.notes ?? ""),
      createdAt: String(withdrawal.created_at),
      withdrawalType: withdrawal.withdrawal_type === "salary" ? "salary" : "extraordinary",
      salaryPeriod: withdrawal.salary_period ? String(withdrawal.salary_period) : null,
      targetAmountSnapshot: withdrawal.target_amount_snapshot == null ? null : numberValue(withdrawal.target_amount_snapshot),
      coveragePercentage: withdrawal.coverage_percentage == null ? null : numberValue(withdrawal.coverage_percentage),
      memberId: withdrawal.member_id ? String(withdrawal.member_id) : null,
      memberName: withdrawal.member_name ? String(withdrawal.member_name) : null
    }))
  };
}
