import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCashMethodValue } from "@/lib/cash";
import { applyStableCreationOrder } from "@/lib/chronology";
import { createPaginationMeta, DEFAULT_PAGE_SIZE, getPaginationRange } from "@/lib/pagination";

export async function getExpenses(page = 1) {
  const supabase = await createServerSupabaseClient();
  const { from, to } = getPaginationRange(page);
  const historyQuery = (supabase as any)
    .from("expenses")
    .select("id, expense_date, type, description, amount, payment_method, impacts_cash, is_voided, observations, created_at, updated_at", { count: "exact" });
  const { data, error, count } = await applyStableCreationOrder(historyQuery)
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []).map((expense: any) => ({
    id: expense.id,
    expenseDate: expense.expense_date,
    type: expense.type,
    description: expense.description,
    amount: Number(expense.amount),
    paymentMethod: normalizeCashMethodValue(expense.payment_method) ?? expense.payment_method,
    impactsCash: expense.impacts_cash,
    isVoided: expense.is_voided,
    observations: expense.observations ?? ""
  }));

  return {
    items,
    pagination: createPaginationMeta(count ?? items.length, page, DEFAULT_PAGE_SIZE)
  };
}
