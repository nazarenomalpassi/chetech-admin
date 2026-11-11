import { getRepairQrBranding } from "@/features/repairs-access/qr-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return getRepairQrBranding();
}
