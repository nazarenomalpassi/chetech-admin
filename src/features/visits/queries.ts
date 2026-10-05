import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getLocalDateInputValue } from "@/lib/utils";
import { buildVisitSummary, getVisitDateRange, sortVisitsForAgenda, type VisitRecord } from "@/features/visits/model";
import type { VisitStatusValue } from "@/features/visits/schemas";
import { createPaginationMeta, getPaginationRange, parsePage } from "@/lib/pagination";

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, "");
}

export async function getVisitsData({
  search,
  status,
  date,
  view = "all",
  technicianId,
  page
}: {
  search?: string;
  status?: string;
  date?: string;
  view?: string;
  technicianId?: string;
  page?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const today = getLocalDateInputValue();
  const range = getVisitDateRange(date || today, view);
  const requestedPage = parsePage(page);
  const { data: technicians, error: techniciansError } = await (supabase as any).from("profiles").select("id, full_name").in("role", ["admin", "tecnico"]).order("full_name");
  if (techniciansError) throw new Error(techniciansError.message);
  function buildQuery(columns: string, head = false) {
    let query = (supabase as any).from("visits").select(columns, { count: head ? "exact" : undefined, head });

    if (search?.trim()) {
      const term = escapeLike(search.trim());
      query = query.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,address.ilike.%${term}%`);
    }

    if (status && status !== "all") query = query.eq("status", status);

    if (range && (date || view !== "all")) query = query.gte("visit_date", range.from).lte("visit_date", range.to);
    if (technicianId === "unassigned") query = query.is("technician_id", null);
    else if (technicianId && /^[0-9a-f-]{36}$/i.test(technicianId)) query = query.eq("technician_id", technicianId);
    return query;
  }

  const countResult = await buildQuery("id", true);
  const pagination = createPaginationMeta(countResult.count ?? 0, requestedPage);
  let data;
  let error = countResult.error;
  if (!error) {
    const requestedRange = getPaginationRange(pagination.page);
    ({ data, error } = await buildQuery("id, customer_name, customer_phone, address, visit_date, time_from, time_to, reason, notes, status, created_at, updated_at, technician_id, technician_name, repair_access_order_id, repair_access_orders(repair_number)")
      .order("visit_date", { ascending: true }).order("time_from", { ascending: true }).order("id", { ascending: true }).range(requestedRange.from, requestedRange.to));
  }

  if (error) {
    if (["42P01", "42703", "PGRST200", "PGRST204"].includes(error.code)) {
      return {
        migrationReady: false,
        today,
        technicians: technicians ?? [],
        pagination: createPaginationMeta(0, 1),
        filters: {
          search: search ?? "",
          status: status ?? "all",
          date: date ?? "",
          view,
          technicianId: technicianId ?? ""
        },
        visits: [] as VisitRecord[],
        summary: {
          todayCount: 0,
          pendingTodayCount: 0,
          openCount: 0,
          upcomingCount: 0,
          nextVisit: null as VisitRecord | null
        }
      };
    }

    throw new Error(error.message);
  }

  const visits = sortVisitsForAgenda(
    ((data ?? []) as any[]).map((visit) => ({
      id: visit.id,
      customerName: visit.customer_name,
      customerPhone: visit.customer_phone,
      address: visit.address,
      visitDate: visit.visit_date,
      timeFrom: String(visit.time_from).slice(0, 5),
      timeTo: String(visit.time_to).slice(0, 5),
      reason: visit.reason,
      notes: visit.notes ?? "",
      status: visit.status as VisitStatusValue,
      createdAt: visit.created_at,
      updatedAt: visit.updated_at,
      technicianId: visit.technician_id,
      technicianName: visit.technician_name ?? "Sin asignar",
      repairAccessOrderId: visit.repair_access_order_id,
      repairNumber: visit.repair_access_orders?.repair_number ?? ""
    })),
    today
  );

  const summary = buildVisitSummary(visits, today);

  return {
    migrationReady: true,
    today,
    technicians: technicians ?? [],
    pagination,
    filters: {
      search: search ?? "",
      status: status ?? "all",
      date: date ?? "",
      view,
      technicianId: technicianId ?? ""
    },
    visits,
    summary: {
      todayCount: summary.todayCount,
      pendingTodayCount: summary.pendingCount,
      openCount: visits.filter((visit) => !["realizada", "cancelada"].includes(visit.status)).length,
      upcomingCount: visits.filter((visit) => visit.visitDate > today && !["realizada", "cancelada"].includes(visit.status)).length,
      nextVisit: summary.nextVisit
    }
  };
}

export async function getVisitsTodayDashboardSummary() {
  const supabase = await createServerSupabaseClient();
  const today = getLocalDateInputValue();

  const { data, error } = await (supabase as any)
    .from("visits")
    .select("id, customer_name, customer_phone, address, visit_date, time_from, time_to, reason, notes, status, created_at")
    .gte("visit_date", today)
    .order("visit_date", { ascending: true })
    .order("time_from", { ascending: true })
    .limit(30);

  if (error?.code === "42P01") {
    return {
      todayCount: 0,
      pendingCount: 0,
      nextVisit: null as VisitRecord | null
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  const visits = ((data ?? []) as any[]).map((visit) => ({
    id: visit.id,
    customerName: visit.customer_name,
    customerPhone: visit.customer_phone,
    address: visit.address,
    visitDate: visit.visit_date,
    timeFrom: String(visit.time_from).slice(0, 5),
    timeTo: String(visit.time_to).slice(0, 5),
    reason: visit.reason,
    notes: visit.notes ?? "",
    status: visit.status as VisitStatusValue,
    createdAt: visit.created_at
  }));

  return buildVisitSummary(visits, today);
}
