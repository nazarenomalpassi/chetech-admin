import { cache } from "react";

import type { CashMethod } from "@/lib/cash";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const DEFAULT_CASH_SETTINGS = {
  openingBalances: {
    efectivo: 193573,
    nx: 60344,
    mp: 10000
  } satisfies Record<CashMethod, number>,
  movementCutoff: "2026-04-16T14:21:01.222Z"
};

const CASH_SETTINGS_KEY = "cash_runtime";
const BUSINESS_GOALS_KEY = "business_goals";

export const DEFAULT_BUSINESS_GOALS = {
  salesTarget: 2500000,
  profitTarget: 900000,
  repairsTarget: 1200000,
  invoicingTarget: 3000000
};

export const getCashSettings = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("value")
    .eq("key", CASH_SETTINGS_KEY)
    .maybeSingle();

  if (error?.code === "42P01") {
    return DEFAULT_CASH_SETTINGS;
  }

  if (error || !data?.value) {
    return DEFAULT_CASH_SETTINGS;
  }

  const value = data.value as {
    openingBalances?: Partial<Record<CashMethod, number>>;
    movementCutoff?: string;
  };

  return {
    openingBalances: {
      efectivo: Number(value.openingBalances?.efectivo ?? DEFAULT_CASH_SETTINGS.openingBalances.efectivo),
      nx: Number(value.openingBalances?.nx ?? DEFAULT_CASH_SETTINGS.openingBalances.nx),
      mp: Number(value.openingBalances?.mp ?? DEFAULT_CASH_SETTINGS.openingBalances.mp)
    } satisfies Record<CashMethod, number>,
    movementCutoff: value.movementCutoff ?? DEFAULT_CASH_SETTINGS.movementCutoff
  };
});

export const getCashSettingsKey = () => CASH_SETTINGS_KEY;
export const getBusinessGoalsKey = () => BUSINESS_GOALS_KEY;

export const getBusinessGoals = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("value")
    .eq("key", BUSINESS_GOALS_KEY)
    .maybeSingle();

  if (error?.code === "42P01") {
    return DEFAULT_BUSINESS_GOALS;
  }

  if (error || !data?.value) {
    return DEFAULT_BUSINESS_GOALS;
  }

  const value = data.value as Partial<typeof DEFAULT_BUSINESS_GOALS>;

  return {
    salesTarget: Number(value.salesTarget ?? DEFAULT_BUSINESS_GOALS.salesTarget),
    profitTarget: Number(value.profitTarget ?? DEFAULT_BUSINESS_GOALS.profitTarget),
    repairsTarget: Number(value.repairsTarget ?? DEFAULT_BUSINESS_GOALS.repairsTarget),
    invoicingTarget: Number(value.invoicingTarget ?? DEFAULT_BUSINESS_GOALS.invoicingTarget)
  };
});
