import { ExpensesList } from "@/features/expenses/components/expenses-list";
import { getExpenses } from "@/features/expenses/queries";
import { getStatusMessage } from "@/lib/form-state";

export default async function GastosPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const expenses = await getExpenses();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <ExpensesList expenses={expenses} message={message} />;
}
