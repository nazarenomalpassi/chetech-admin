import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getLocalDateInputValue } from "@/lib/utils";
import { buildVisitSummary, sortVisitsForAgenda, type VisitRecord } from "@/features/visits/model";
import type { VisitStatusValue } from "@/features/visits/schemas";

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, "");
}

export async function getVisitsData({
  search,
  status,
  date
}: {
  search?: string;
  status?: string;
  date?: string;
}) {
  const supabase = await createServerSupabaseClient();
  const today = getLocalDateInputValue();
  let query = (supabase as any)
    .from("visits")
    .select("id, customer_name, customer_phone, address, visit_date, time_from, time_to, reason, notes, status, created_at")
    .limit(300);

  if (search?.trim()) {
    const term = escapeLike(search.trim());
    query = query.or(
      `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,address.ilike.%${term}%`
    );
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (date) {
    query = query.eq("visit_date", date);
  }

  const { data, error } = await query.order("visit_date", { ascending: true }).order("time_from", { ascending: true });

  if (error) {
    if (error.code === "42P01") {
      return {
        migrationReady: false,
        today,
        filters: {
          search: search ?? "",
          status: status ?? "all",
          date: date ?? ""
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
      createdAt: visit.created_at
    })),
    today
  );

  const summary = buildVisitSummary(visits, today);

  return {
    migrationReady: true,
    today,
    filters: {
      search: search ?? "",
      status: status ?? "all",
      date: date ?? ""
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
