import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCashMethodValue } from "@/lib/cash";

function getArgentinaMonthString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 15, 12, 0, 0);
  const formatter = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric"
  });

  return formatter.format(date);
}

export async function getSalaryWithdrawalsData() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("salary_withdrawals")
    .select("id, withdrawal_date, amount, payment_method, notes, created_at")
    .order("withdrawal_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === "42P01") {
      return {
        migrationReady: false,
        currentMonth: getArgentinaMonthString(new Date()),
        currentMonthLabel: formatMonthLabel(getArgentinaMonthString(new Date())),
        currentMonthTotal: 0,
        currentMonthByMethod: { efectivo: 0, nx: 0, mp: 0 },
        monthlyTotals: [],
        withdrawals: []
      };
    }

    throw new Error(error.message);
  }

  const withdrawals = ((data ?? []) as any[]).map((withdrawal) => ({
    id: withdrawal.id,
    withdrawalDate: withdrawal.withdrawal_date,
    amount: Number(withdrawal.amount),
    paymentMethod: normalizeCashMethodValue(withdrawal.payment_method) ?? withdrawal.payment_method,
    notes: withdrawal.notes ?? "",
    createdAt: withdrawal.created_at
  }));

  const currentMonth = getArgentinaMonthString(new Date());
  const currentMonthLabel = formatMonthLabel(currentMonth);

  const monthlyMap = new Map<
    string,
    { month: string; label: string; total: number; count: number; byMethod: { efectivo: number; nx: number; mp: number } }
  >();

  for (const withdrawal of withdrawals) {
    const month = withdrawal.withdrawalDate.slice(0, 7);
    const existing = monthlyMap.get(month) ?? {
      month,
      label: formatMonthLabel(month),
      total: 0,
      count: 0,
      byMethod: { efectivo: 0, nx: 0, mp: 0 }
    };

    existing.total += withdrawal.amount;
    existing.count += 1;
    const method = normalizeCashMethodValue(withdrawal.paymentMethod);
    if (method) {
      existing.byMethod[method] += withdrawal.amount;
    }
    monthlyMap.set(month, existing);
  }

  const monthlyTotals = Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month));
  const currentMonthSummary = monthlyMap.get(currentMonth) ?? {
    total: 0,
    byMethod: { efectivo: 0, nx: 0, mp: 0 }
  };

  return {
    migrationReady: true,
    currentMonth,
    currentMonthLabel,
    currentMonthTotal: currentMonthSummary.total,
    currentMonthByMethod: currentMonthSummary.byMethod,
    monthlyTotals,
    withdrawals
  };
}
