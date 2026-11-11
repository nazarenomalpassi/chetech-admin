import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { repairQrId } from "@/features/repairs-access/repair-qr-links";
import ReparacionesAccessPage from "../../page";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Orden de taller",
  robots: { index: false, follow: false },
};

export default async function PrivateRepairPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("repairs.view");
  const parsed = repairQrId.safeParse((await params).id);
  if (!parsed.success) notFound();
  return ReparacionesAccessPage({
    searchParams: Promise.resolve({ order: parsed.data, view: "detalle" }),
  });
}
