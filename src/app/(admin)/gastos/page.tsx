import { ExpensesList } from "@/features/expenses/components/expenses-list";
import { getExpenses } from "@/features/expenses/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { parsePage } from "@/lib/pagination";

export default async function GastosPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; page?: string; savedOperation?: string; savedScope?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("expenses.manage");
  const expensesResult = await getExpenses(parsePage(params.page));
  const message = params.error
    ? { success: false, message: params.error }
    : params.status === "expense_linked" ? { success: true, message: "Vinculo guardado sin modificar caja." } : getStatusMessage(params.status);

  return (
    <ExpensesList
      canDelete={profile.role === "admin"}
      ownerId={profile.id}
      savedOperation={params.savedOperation}
      savedScope={params.savedScope}
      expenses={expensesResult.items}
      message={message}
      pagination={expensesResult.pagination}
    />
  );
}
