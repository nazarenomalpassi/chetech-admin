import { getLocalDateInputValue } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInstallmentSaleStatus, resolveInstallmentStatus, type InstallmentSaleStatus } from "@/features/installments/model";

type InstallmentFilters = {
  customer?: string;
  product?: string;
  status?: string;
  dueFrom?: string;
  dueTo?: string;
  paymentMethod?: string;
};

function isMissingInstallmentsTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("public.installment_sales") ||
    message.includes("public.installments") ||
    message.includes("could not find the table")
  );
}

function includesNormalized(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function matchesInstallmentFilters(
  installment: {
    dueDate: string;
    paymentMethod: string;
    displayStatus: string;
  },
  filters: InstallmentFilters
) {
  if (filters.status && installment.displayStatus !== filters.status) return false;
  if (filters.paymentMethod && installment.paymentMethod !== filters.paymentMethod) return false;
  if (filters.dueFrom && installment.dueDate < filters.dueFrom) return false;
  if (filters.dueTo && installment.dueDate > filters.dueTo) return false;
  return true;
}

export async function getInstallmentSalesData(filters: InstallmentFilters) {
  const supabase = await createServerSupabaseClient();
  const today = getLocalDateInputValue();
  const salesResult = await (supabase as any)
    .from("installment_sales")
    .select("id, product_name, customer_name, total_amount, installments_count, notes, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (salesResult.error) {
    if (isMissingInstallmentsTableError(salesResult.error)) {
      return {
        migrationReady: false,
        today,
        summary: {
          activeSales: 0,
          pendingInstallments: 0,
          overdueInstallments: 0,
          paidInstallments: 0
        },
        sales: []
      };
    }

    throw new Error(salesResult.error.message);
  }

  const saleIds = (salesResult.data ?? []).map((sale: any) => sale.id);
  const installmentsResult = saleIds.length
    ? await (supabase as any)
        .from("installments")
        .select("id, installment_sale_id, installment_number, due_date, amount, payment_method, status, paid_at, notes, created_at, updated_at")
        .in("installment_sale_id", saleIds)
        .order("installment_number", { ascending: true })
    : { data: [], error: null };

  if (installmentsResult.error) {
    if (isMissingInstallmentsTableError(installmentsResult.error)) {
      return {
        migrationReady: false,
        today,
        summary: {
          activeSales: 0,
          pendingInstallments: 0,
          overdueInstallments: 0,
          paidInstallments: 0
        },
        sales: []
      };
    }

    throw new Error(installmentsResult.error.message);
  }

  const installmentsBySale = new Map<string, any[]>();
  for (const installment of installmentsResult.data ?? []) {
    const current = installmentsBySale.get(installment.installment_sale_id) ?? [];
    current.push(installment);
    installmentsBySale.set(installment.installment_sale_id, current);
  }

  const sales = (salesResult.data ?? [])
    .map((sale: any) => {
      const installments = (installmentsBySale.get(sale.id) ?? []).map((installment: any) => ({
        id: installment.id,
        saleId: installment.installment_sale_id,
        installmentNumber: Number(installment.installment_number),
        dueDate: installment.due_date,
        amount: Number(installment.amount),
        paymentMethod: installment.payment_method,
        status: installment.status,
        displayStatus: resolveInstallmentStatus(installment.status, installment.due_date, today),
        paidAt: installment.paid_at,
        notes: installment.notes ?? "",
        createdAt: installment.created_at,
        updatedAt: installment.updated_at
      }));

      const saleDisplayStatus = getInstallmentSaleStatus(
        sale.status as InstallmentSaleStatus,
        installments.map((installment) => ({
          status: installment.status,
          dueDate: installment.dueDate
        }))
      );

      const matchesCustomer = !filters.customer || includesNormalized(sale.customer_name, filters.customer);
      const matchesProduct = !filters.product || includesNormalized(sale.product_name, filters.product);
      const filteredInstallments = installments.filter((installment) => matchesInstallmentFilters(installment, filters));

      if (!matchesCustomer || !matchesProduct) {
        return null;
      }

      if ((filters.status || filters.paymentMethod || filters.dueFrom || filters.dueTo) && !filteredInstallments.length) {
        return null;
      }

      const visibleInstallments =
        filters.status || filters.paymentMethod || filters.dueFrom || filters.dueTo
          ? filteredInstallments
          : installments;

      const paidAmount = installments
        .filter((installment) => installment.status === "pagada")
        .reduce((acc, installment) => acc + installment.amount, 0);

      const pendingAmount = installments
        .filter((installment) => installment.status !== "pagada" && installment.status !== "cancelada")
        .reduce((acc, installment) => acc + installment.amount, 0);

      return {
        id: sale.id,
        productName: sale.product_name,
        customerName: sale.customer_name,
        totalAmount: Number(sale.total_amount),
        installmentsCount: Number(sale.installments_count),
        notes: sale.notes ?? "",
        status: sale.status,
        displayStatus: saleDisplayStatus,
        createdAt: sale.created_at,
        updatedAt: sale.updated_at,
        paidAmount,
        pendingAmount,
        paidCount: installments.filter((installment) => installment.status === "pagada").length,
        installments: visibleInstallments
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      productName: string;
      customerName: string;
      totalAmount: number;
      installmentsCount: number;
      notes: string;
      status: InstallmentSaleStatus;
      displayStatus: InstallmentSaleStatus;
      createdAt: string;
      updatedAt: string;
      paidAmount: number;
      pendingAmount: number;
      paidCount: number;
      installments: Array<{
        id: string;
        saleId: string;
        installmentNumber: number;
        dueDate: string;
        amount: number;
        paymentMethod: string;
        status: string;
        displayStatus: string;
        paidAt: string | null;
        notes: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>;

  const allVisibleInstallments = sales.flatMap((sale) => sale.installments);

  return {
    migrationReady: true,
    today,
    summary: {
      activeSales: sales.filter((sale) => sale.displayStatus === "activa").length,
      pendingInstallments: allVisibleInstallments.filter((installment) => installment.displayStatus === "pendiente").length,
      overdueInstallments: allVisibleInstallments.filter((installment) => installment.displayStatus === "vencida").length,
      paidInstallments: allVisibleInstallments.filter((installment) => installment.displayStatus === "pagada").length
    },
    sales
  };
}

export async function getDashboardInstallmentsData(supabase: any, today: string) {
  const installmentsResult = await (supabase as any)
    .from("installments")
    .select("id, installment_sale_id, installment_number, due_date, amount, payment_method, status")
    .in("status", ["pendiente", "vencida"]);

  if (installmentsResult.error) {
    if (isMissingInstallmentsTableError(installmentsResult.error)) {
      return {
        dueTodayCount: 0,
        overdueCount: 0,
        dueTodayTotal: 0,
        overdueTotal: 0,
        dueToday: [],
        overdue: []
      };
    }

    throw new Error(installmentsResult.error.message);
  }

  const installments = ((installmentsResult.data ?? []) as any[]).map((installment: any) => ({
    id: installment.id,
    saleId: installment.installment_sale_id,
    installmentNumber: Number(installment.installment_number),
    dueDate: installment.due_date,
    amount: Number(installment.amount),
    paymentMethod: installment.payment_method,
    status: installment.status,
    displayStatus: resolveInstallmentStatus(installment.status, installment.due_date, today)
  }));

  const saleIds = Array.from(new Set(installments.map((installment) => installment.saleId)));
  const salesResult = saleIds.length
    ? await (supabase as any)
        .from("installment_sales")
        .select("id, product_name, customer_name, installments_count")
        .in("id", saleIds)
    : { data: [], error: null };

  if (salesResult.error) {
    throw new Error(salesResult.error.message);
  }

  const salesById = new Map<string, any>((salesResult.data ?? []).map((sale: any) => [sale.id, sale]));
  const dueToday = installments
    .filter((installment: (typeof installments)[number]) => installment.displayStatus === "pendiente" && installment.dueDate === today)
    .map((installment) => {
      const sale = salesById.get(installment.saleId);

      return {
        id: installment.id,
        customerName: sale?.customer_name ?? "Cliente",
        productName: sale?.product_name ?? "Producto",
        installmentLabel: `${installment.installmentNumber}/${sale?.installments_count ?? installment.installmentNumber}`,
        dueDate: installment.dueDate,
        amount: installment.amount,
        paymentMethod: installment.paymentMethod,
        status: installment.displayStatus
      };
    })
    .slice(0, 6);

  const overdue = installments
    .filter((installment: (typeof installments)[number]) => installment.displayStatus === "vencida")
    .sort((a: (typeof installments)[number], b: (typeof installments)[number]) => a.dueDate.localeCompare(b.dueDate))
    .map((installment) => {
      const sale = salesById.get(installment.saleId);

      return {
        id: installment.id,
        customerName: sale?.customer_name ?? "Cliente",
        productName: sale?.product_name ?? "Producto",
        installmentLabel: `${installment.installmentNumber}/${sale?.installments_count ?? installment.installmentNumber}`,
        dueDate: installment.dueDate,
        amount: installment.amount,
        paymentMethod: installment.paymentMethod,
        status: installment.displayStatus
      };
    })
    .slice(0, 6);

  return {
    dueTodayCount: installments.filter((installment: (typeof installments)[number]) => installment.displayStatus === "pendiente" && installment.dueDate === today).length,
    overdueCount: installments.filter((installment: (typeof installments)[number]) => installment.displayStatus === "vencida").length,
    dueTodayTotal: installments
      .filter((installment: (typeof installments)[number]) => installment.displayStatus === "pendiente" && installment.dueDate === today)
      .reduce((acc: number, installment: (typeof installments)[number]) => acc + installment.amount, 0),
    overdueTotal: installments
      .filter((installment: (typeof installments)[number]) => installment.displayStatus === "vencida")
      .reduce((acc: number, installment: (typeof installments)[number]) => acc + installment.amount, 0),
    dueToday,
    overdue
  };
}
