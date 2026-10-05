import { repairAccessClosedStatuses } from "@/features/repairs-access/components/repair-access-helpers";
import { repairAccessStatusValues } from "@/features/repairs-access/schemas";
import {
  getOperationalDate,
  getWarrantyState,
  type RepairWarrantyState
} from "@/features/repairs-access/warranty";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyStableCreationOrder } from "@/lib/chronology";
import { readRecordPages } from "@/lib/read-record-pages";
import type { WorkshopOrderContext } from "./workflow";

type RawOrder = {
  id: string;
  repair_number: string | null;
  intake_date: string;
  issue_reported: string;
  technical_diagnosis: string | null;
  repair_progress: string | null;
  budget_amount: number | null;
  budget_detail: string | null;
  budget_response_notes: string | null;
  budget_response_at: string | null;
  approved_amount: number | null;
  final_amount: number | null;
  payment_method: string | null;
  payment_notes: string | null;
  is_paid: boolean;
  paid_at: string | null;
  delivered_at: string | null;
  picked_up_at: string | null;
  has_warranty: boolean;
  warranty_requires_review: boolean;
  warranty_start: string | null;
  warranty_until: string | null;
  warranty_days: number | null;
  warranty_conditions: string | null;
  warranty_active: boolean;
  historical_warranty_expired?: boolean | null;
  legacy_order_number?: string | null;
  import_source?: string | null;
  import_file_name?: string | null;
  import_row_key?: string | null;
  imported_at?: string | null;
  work_performed: string | null;
  used_parts: string | null;
  internal_observations: string | null;
  technician_name: string | null;
  technician_id?: string | null;
  customer_user_id?: string | null;
  customer_public_id?: string | null;
  public_progress?: string | null;
  public_next_step?: string | null;
  budget_visible_to_customer?: boolean | null;
  public_budget_description?: string | null;
  budget_valid_until?: string | null;
  customer_action_required?: boolean | null;
  last_customer_visible_update_at?: string | null;
  customer_portal_linked?: boolean | null;
  notes: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  repair_access_customers: {
    id: string;
    full_name: string;
    phone: string | null;
    alternate_phone: string | null;
    phone_normalized: string | null;
    dni: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  } | null;
  repair_access_devices: {
    id: string;
    device_type: string;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    accessory_details: string | null;
    visual_condition: string | null;
    notes: string | null;
  } | null;
  storefront_customer?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  }[] | null;
};

export type StorefrontCustomerSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
};

export type RepairAccessOrderRecord = {
  workflow?: WorkshopOrderContext;
  id: string;
  repairNumber: string;
  intakeDate: string;
  issueReported: string;
  technicalDiagnosis: string | null;
  repairProgress: string | null;
  budgetAmount: number;
  budgetDetail: string | null;
  budgetResponseNotes: string | null;
  budgetResponseAt: string | null;
  approvedAmount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentNotes: string | null;
  isPaid: boolean;
  paidAt: string | null;
  deliveredAt: string | null;
  pickedUpAt: string | null;
  hasWarranty: boolean;
  warrantyRequiresReview: boolean;
  warrantyStart: string | null;
  warrantyUntil: string | null;
  warrantyDays: number;
  warrantyConditions: string | null;
  warrantyActive: boolean;
  warranty: RepairWarrantyState;
  historicalWarrantyExpired: boolean | null;
  legacyOrderNumber: string | null;
  importSource: string | null;
  importFileName: string | null;
  importRowKey: string | null;
  importedAt: string | null;
  workPerformed: string | null;
  usedParts: string | null;
  internalObservations: string | null;
  technicianName: string | null;
  customerUserId: string | null;
  customerPublicId: string | null;
  publicProgress: string | null;
  publicNextStep: string | null;
  budgetVisibleToCustomer: boolean;
  publicBudgetDescription: string | null;
  budgetValidUntil: string | null;
  customerActionRequired: boolean;
  lastCustomerVisibleUpdateAt: string | null;
  customerPortalLinked: boolean;
  storefrontCustomer: StorefrontCustomerSummary | null;
  notes: string | null;
  priority: string | null;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    alternatePhone: string;
    phoneNormalized: string;
    dni: string;
    email: string;
    address: string;
    notes: string;
  };
  device: {
    id: string;
    deviceType: string;
    brand: string;
    model: string;
    serialNumber: string;
    accessoryDetails: string;
    visualCondition: string;
    notes: string;
  };
};

export type RepairAccessCustomerSummary = {
  id: string;
  fullName: string;
  phone: string;
  alternatePhone: string;
  dni: string;
  email: string;
  address: string;
  notes: string;
  source: string;
  createdAt: string;
};

export type RepairAccessImportSummary = {
  id: string;
  fileName: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
};

export type RepairAccessSummary = {
  totalOrders: number;
  totalCustomers: number;
  activeOrders: number;
  paidOrders: number;
  pendingBudget: number;
  totalProjected: number;
  totalCollected: number;
  intakeToday: number;
  deliveredToday: number;
  collectedToday: number;
  readyToPickup: number;
  waitingCustomer: number;
  delayedOrders: number;
  activeWarranties: number;
  statusCounts: Record<string, number>;
};

function toDateOnly(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

function getDaysOpen(intakeDate: string) {
  const intake = new Date(`${intakeDate}T00:00:00`);
  if (Number.isNaN(intake.getTime())) return 0;
  const diff = Date.now() - intake.getTime();
  return Math.floor(diff / 86_400_000);
}

export function mapOrder(order: RawOrder): RepairAccessOrderRecord {
  const storefrontCustomer = Array.isArray(order.storefront_customer)
    ? order.storefront_customer[0] ?? null
    : order.storefront_customer ?? null;
  const hasWarranty = Boolean(
    order.has_warranty ??
      (Number(order.warranty_days ?? 0) > 0 ||
        Boolean(order.warranty_start) ||
        Boolean(order.warranty_until))
  );
  const warranty = getWarrantyState({
    hasWarranty,
    warrantyDays: Number(order.warranty_days ?? 0),
    pickedUpAt: order.picked_up_at ?? null,
    repairStatus: order.status,
    warrantyStart: order.warranty_start,
    warrantyUntil: order.warranty_until,
    requiresReview: Boolean(order.warranty_requires_review)
  });

  return {
    id: order.id,
    repairNumber: order.repair_number ?? "Sin numero",
    intakeDate: order.intake_date,
    issueReported: order.issue_reported,
    technicalDiagnosis: order.technical_diagnosis,
    repairProgress: order.repair_progress,
    budgetAmount: Number(order.budget_amount ?? 0),
    budgetDetail: order.budget_detail,
    budgetResponseNotes: order.budget_response_notes,
    budgetResponseAt: order.budget_response_at,
    approvedAmount: Number(order.approved_amount ?? 0),
    finalAmount: Number(order.final_amount ?? 0),
    paymentMethod: order.payment_method ?? "",
    paymentNotes: order.payment_notes,
    isPaid: Boolean(order.is_paid),
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at,
    pickedUpAt: order.picked_up_at ?? null,
    hasWarranty,
    warrantyRequiresReview: Boolean(order.warranty_requires_review),
    warrantyStart: order.warranty_start,
    warrantyUntil: order.warranty_until,
    warrantyDays: Number(order.warranty_days ?? 0),
    warrantyConditions: order.warranty_conditions,
    warrantyActive: Boolean(order.warranty_active),
    warranty,
    historicalWarrantyExpired: order.historical_warranty_expired ?? null,
    legacyOrderNumber: order.legacy_order_number ?? null,
    importSource: order.import_source ?? null,
    importFileName: order.import_file_name ?? null,
    importRowKey: order.import_row_key ?? null,
    importedAt: order.imported_at ?? null,
    workPerformed: order.work_performed,
    usedParts: order.used_parts,
    internalObservations: order.internal_observations,
    technicianName: order.technician_name,
    customerUserId: order.customer_user_id ?? null,
    customerPublicId: order.customer_public_id ?? null,
    publicProgress: order.public_progress ?? null,
    publicNextStep: order.public_next_step ?? null,
    budgetVisibleToCustomer: Boolean(order.budget_visible_to_customer),
    publicBudgetDescription: order.public_budget_description ?? null,
    budgetValidUntil: order.budget_valid_until ?? null,
    customerActionRequired: Boolean(order.customer_action_required),
    lastCustomerVisibleUpdateAt: order.last_customer_visible_update_at ?? null,
    customerPortalLinked: Boolean(
      order.customer_portal_linked ?? order.customer_user_id ?? storefrontCustomer?.id
    ),
    storefrontCustomer: storefrontCustomer
      ? {
          id: storefrontCustomer.id,
          fullName: storefrontCustomer.full_name ?? "Cliente sin nombre",
          email: storefrontCustomer.email ?? "",
          phone: storefrontCustomer.phone ?? ""
        }
      : null,
    notes: order.notes,
    priority: order.priority,
    status: order.status,
    createdAt: order.created_at,
    customer: {
      id: order.repair_access_customers?.id ?? "",
      fullName: order.repair_access_customers?.full_name ?? "Sin cliente",
      phone: order.repair_access_customers?.phone ?? "",
      alternatePhone: order.repair_access_customers?.alternate_phone ?? "",
      phoneNormalized: order.repair_access_customers?.phone_normalized ?? "",
      dni: order.repair_access_customers?.dni ?? "",
      email: order.repair_access_customers?.email ?? "",
      address: order.repair_access_customers?.address ?? "",
      notes: order.repair_access_customers?.notes ?? ""
    },
    device: {
      id: order.repair_access_devices?.id ?? "",
      deviceType: order.repair_access_devices?.device_type ?? "Equipo",
      brand: order.repair_access_devices?.brand ?? "",
      model: order.repair_access_devices?.model ?? "",
      serialNumber: order.repair_access_devices?.serial_number ?? "",
      accessoryDetails: order.repair_access_devices?.accessory_details ?? "",
      visualCondition: order.repair_access_devices?.visual_condition ?? "",
      notes: order.repair_access_devices?.notes ?? ""
    }
  };
}

export async function getRepairsAccessDashboard({
  includeAdministration = true
}: {
  includeAdministration?: boolean;
} = {}) {
  const supabase = await createServerSupabaseClient();
  const orderColumns = `
      id,
      repair_number,
      intake_date,
      issue_reported,
      technical_diagnosis,
      repair_progress,
      budget_amount,
      budget_detail,
      budget_response_notes,
      budget_response_at,
      approved_amount,
      final_amount,
      payment_method,
      payment_notes,
      is_paid,
      paid_at,
      delivered_at,
      picked_up_at,
      has_warranty,
      warranty_requires_review,
      warranty_start,
      warranty_until,
      warranty_days,
      warranty_conditions,
      warranty_active,
      historical_warranty_expired,
      legacy_order_number,
      import_source,
      import_file_name,
      import_row_key,
      imported_at,
      work_performed,
      used_parts,
      internal_observations,
      technician_name,
      customer_user_id,
      customer_public_id,
      public_progress,
      public_next_step,
      budget_visible_to_customer,
      public_budget_description,
      budget_valid_until,
      customer_action_required,
      last_customer_visible_update_at,
      notes,
      priority,
      status,
      created_at,
      repair_access_customers (
        id, full_name, phone, alternate_phone, phone_normalized, dni, email, address, notes
      ),
      repair_access_devices (
        id, device_type, brand, model, serial_number, accessory_details, visual_condition, notes
      ),
      storefront_customer:profiles!repair_access_orders_customer_user_id_fkey (
        id, full_name, email, phone
      )
    `;
  const ordersPromise = readRecordPages<any>((from, to) => includeAdministration
    ? applyStableCreationOrder(
        (supabase as any)
          .from("repair_access_orders")
          .select(orderColumns)
      )
        .range(from, to)
    : (supabase as any).rpc("get_technician_repair_orders", { p_order_id: null }).range(from, to),
    500,
    (row) => includeAdministration ? row.id : row.payload.id);
  const [ordersResult, customerCount, recentCustomers, latestImport] = await Promise.all([
    ordersPromise,
    includeAdministration
      ? (supabase as any).from("repair_access_customers").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0, error: null }),
    includeAdministration
      ? (supabase as any)
          .from("repair_access_customers")
          .select("id, full_name, phone, alternate_phone, dni, email, address, notes, source, created_at")
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [], error: null }),
    includeAdministration
      ? (supabase as any)
          .from("repair_access_import_batches")
          .select("id, file_name, total_rows, imported_count, updated_count, duplicate_count, error_count, created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (customerCount.error) throw new Error(customerCount.error.message);
  if (recentCustomers.error) throw new Error(recentCustomers.error.message);
  if (latestImport.error) throw new Error(latestImport.error.message);

  const rawOrders = includeAdministration
    ? ordersResult
    : ordersResult.map((row: { payload: RawOrder }) => row.payload);
  const orders: RepairAccessOrderRecord[] = rawOrders.map((order: RawOrder) => mapOrder(order));
  for (let from = 0; from < orders.length; from += 100) {
    const contextResult = await (supabase as any).rpc("get_workshop_context", { p_order_ids: orders.slice(from, from + 100).map((order) => order.id) });
    if (contextResult.error) {
      if (contextResult.error.code === "PGRST202" || contextResult.error.code === "42883") break;
      throw new Error(contextResult.error.message);
    }
    const contexts = new Map<string, WorkshopOrderContext>((contextResult.data ?? []).map((context: WorkshopOrderContext & { id: string }) => [context.id, context]));
    orders.slice(from, from + 100).forEach((order) => { order.workflow = contexts.get(order.id); });
  }
  const today = getOperationalDate();
  const statusCounts = repairAccessStatusValues.reduce<Record<string, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  orders.forEach((order) => {
    statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
  });

  const activeOrders = orders.filter((order: RepairAccessOrderRecord) => !repairAccessClosedStatuses.includes(order.status as any)).length;
  const paidOrders = orders.filter((order: RepairAccessOrderRecord) => order.isPaid).length;
  const pendingBudget = orders.filter((order: RepairAccessOrderRecord) => ["pendiente_revision", "en_revision"].includes(order.status)).length;
  const totalProjected = orders.reduce((acc: number, order: RepairAccessOrderRecord) => acc + (order.finalAmount || order.budgetAmount || 0), 0);
  const totalCollected = orders.reduce((acc: number, order: RepairAccessOrderRecord) => acc + (order.isPaid ? order.finalAmount || order.budgetAmount || 0 : 0), 0);
  const delayedOrders = orders.filter((order: RepairAccessOrderRecord) => !repairAccessClosedStatuses.includes(order.status as any) && getDaysOpen(order.intakeDate) >= 7).length;

  return {
    orders,
    customers: (recentCustomers.data ?? []).map((customer: any) => ({
      id: customer.id,
      fullName: customer.full_name,
      phone: customer.phone ?? "",
      alternatePhone: customer.alternate_phone ?? "",
      dni: customer.dni ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
      source: customer.source,
      createdAt: customer.created_at
    })),
    latestImport: latestImport.data
      ? {
          id: latestImport.data.id,
          fileName: latestImport.data.file_name,
          totalRows: latestImport.data.total_rows,
          importedCount: latestImport.data.imported_count,
          updatedCount: latestImport.data.updated_count,
          duplicateCount: latestImport.data.duplicate_count,
          errorCount: latestImport.data.error_count,
          createdAt: latestImport.data.created_at
        }
      : null,
    summary: {
      totalOrders: orders.length,
      totalCustomers: customerCount.count ?? 0,
      activeOrders,
      paidOrders,
      pendingBudget,
      totalProjected,
      totalCollected,
      intakeToday: orders.filter((order: RepairAccessOrderRecord) => toDateOnly(order.intakeDate) === today).length,
      deliveredToday: orders.filter((order: RepairAccessOrderRecord) => toDateOnly(order.deliveredAt) === today).length,
      collectedToday: orders.filter((order: RepairAccessOrderRecord) => toDateOnly(order.paidAt) === today).length,
      readyToPickup: orders.filter((order: RepairAccessOrderRecord) => order.status === "listo_para_retirar").length,
      waitingCustomer: orders.filter((order: RepairAccessOrderRecord) => order.status === "presupuestado").length,
      delayedOrders,
      activeWarranties: orders.filter((order: RepairAccessOrderRecord) =>
        ["active", "expires_today"].includes(order.warranty.code)
      ).length,
      statusCounts
    }
  };
}
