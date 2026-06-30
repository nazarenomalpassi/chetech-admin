import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BalanceTransferRecord = {
  id: string;
  fromPaymentMethod: string;
  toPaymentMethod: string;
  amount: number;
  description: string;
  transferDate: string;
  isVoided: boolean;
  voidedAt: string;
  voidReason: string;
  reversalTransferId: string;
  reversalOfTransferId: string;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string;
  } | null;
};

type RawBalanceTransfer = {
  id: string;
  from_payment_method: string;
  to_payment_method: string;
  amount: number;
  description: string | null;
  transfer_date: string;
  is_voided: boolean;
  voided_at: string | null;
  void_reason: string | null;
  reversal_transfer_id: string | null;
  reversal_of_transfer_id: string | null;
  created_at: string;
  profiles: { id: string; full_name: string | null } | null;
};

export type BalanceTransferSummary = {
  totalActive: number;
  totalVoided: number;
  totalMoved: number;
  activeCount: number;
};

export function mapBalanceTransfer(record: RawBalanceTransfer): BalanceTransferRecord {
  return {
    id: record.id,
    fromPaymentMethod: record.from_payment_method,
    toPaymentMethod: record.to_payment_method,
    amount: Number(record.amount),
    description: record.description ?? "",
    transferDate: record.transfer_date,
    isVoided: record.is_voided,
    voidedAt: record.voided_at ?? "",
    voidReason: record.void_reason ?? "",
    reversalTransferId: record.reversal_transfer_id ?? "",
    reversalOfTransferId: record.reversal_of_transfer_id ?? "",
    createdAt: record.created_at,
    createdBy: record.profiles
      ? {
          id: record.profiles.id,
          fullName: record.profiles.full_name ?? "Usuario"
        }
      : null
  };
}

export async function getBalanceTransfers(supabaseInput?: any) {
  const supabase = supabaseInput ?? (await createServerSupabaseClient());
  const { data, error } = await (supabase as any)
    .from("balance_transfers")
    .select(
      `
        id,
        from_payment_method,
        to_payment_method,
        amount,
        description,
        transfer_date,
        is_voided,
        voided_at,
        void_reason,
        reversal_transfer_id,
        reversal_of_transfer_id,
        created_at,
        profiles:created_by (
          id,
          full_name
        )
      `
    )
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error?.code === "42P01") {
    return [];
  }

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RawBalanceTransfer[]).map(mapBalanceTransfer);
}

export async function getBalanceTransfersData() {
  const transfers = await getBalanceTransfers();
  const operationalTransfers = transfers.filter((transfer) => !transfer.reversalOfTransferId);

  return {
    transfers,
    summary: {
      activeCount: operationalTransfers.filter((transfer) => !transfer.isVoided).length,
      totalActive: operationalTransfers
        .filter((transfer) => !transfer.isVoided)
        .reduce((acc, transfer) => acc + transfer.amount, 0),
      totalVoided: operationalTransfers
        .filter((transfer) => transfer.isVoided)
        .reduce((acc, transfer) => acc + transfer.amount, 0),
      totalMoved: operationalTransfers.reduce((acc, transfer) => acc + transfer.amount, 0)
    } satisfies BalanceTransferSummary
  };
}
