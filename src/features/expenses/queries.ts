import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeCashMethodValue } from "@/lib/cash";

export async function getExpenses() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("expenses")
    .select("id, expense_date, type, description, amount, payment_method, impacts_cash, is_voided, observations")
    .order("expense_date", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((expense: any) => ({
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
}
