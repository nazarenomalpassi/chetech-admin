import { ExpensesList } from "@/features/expenses/components/expenses-list";
import { getExpenses } from "@/features/expenses/queries";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function GastosPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const [{ profile }, expenses] = await Promise.all([getCurrentProfile(), getExpenses()]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <ExpensesList canDelete={profile.role === "admin"} expenses={expenses} message={message} />;
}
