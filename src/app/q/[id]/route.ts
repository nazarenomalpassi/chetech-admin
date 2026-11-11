import { getRepairQrResponse } from "@/features/repairs-access/qr-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return getRepairQrResponse((await params).id);
}
