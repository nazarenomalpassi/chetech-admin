import type { TvBoardReleaseEvidence, TvBoardSaleStatus } from "./sales";

export type TvBoardClaimStatus = "none" | "open" | "cancelled";
export type TvBoardSaleEventKind = "start_claim" | "resume_sale" | "cancel_sale" | "confirm_release";
export type TvBoardRow = {
  id: string;
  brand: string;
  model: string;
  boardType: "fuente" | "main" | "tcom" | "placa_unica";
  price: number;
  acquisitionCost: number | null;
  isActive: boolean;
  isSold: boolean;
  soldAt: string | null;
  netAmount: number | null;
  releaseDate: string | null;
  releasedAt: string | null;
  saleNotes: string | null;
  saleStatus: TvBoardSaleStatus;
  releaseEvidence: TvBoardReleaseEvidence;
  claimStatus: TvBoardClaimStatus;
  claimOpenedAt: string | null;
  claimNotes: string | null;
  claimResolvedAt: string | null;
  claimResolutionNotes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  events: Array<{ id: string; kind: TvBoardSaleEventKind; notes: string; netAmount: number; createdAt: string }>;
};

export type TvBoardFinancialSummary = {
  activeCount: number;
  inactiveCount: number;
  activeValue: number;
  salesNetAmount: number;
  pendingAmount: number;
  heldAmount: number;
  releasedAmount: number;
  cancelledAmount: number;
  knownMargin: number;
  incompleteCosts: number;
};
