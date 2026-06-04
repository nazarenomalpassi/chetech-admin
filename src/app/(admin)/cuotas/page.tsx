import { InstallmentsView } from "@/features/installments/components/installments-view";
import { getInstallmentSalesData } from "@/features/installments/queries";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function CuotasPage({
  searchParams
}: {
  searchParams: Promise<{
    status?: string;
    error?: string;
    customer?: string;
    product?: string;
    state?: string;
    dueFrom?: string;
    dueTo?: string;
    paymentMethod?: string;
  }>;
}) {
  const params = await searchParams;
  const [{ profile }, data] = await Promise.all([
    getCurrentProfile(),
    getInstallmentSalesData({
      customer: params.customer,
      product: params.product,
      status: params.state,
      dueFrom: params.dueFrom,
      dueTo: params.dueTo,
      paymentMethod: params.paymentMethod
    })
  ]);

  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <InstallmentsView
      canCancelSales={profile.role === "admin"}
      data={data}
      filters={{
        customer: params.customer,
        product: params.product,
        status: params.state,
        dueFrom: params.dueFrom,
        dueTo: params.dueTo,
        paymentMethod: params.paymentMethod
      }}
      message={message}
    />
  );
}
