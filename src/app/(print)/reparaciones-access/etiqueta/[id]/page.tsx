import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { RepairLabelPrintPreview } from "@/features/repairs-access/components/repair-label-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiqueta de taller | CHETECH", robots: { index: false, follow: false } };

export default async function WorkshopLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("repairs.view");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <RepairLabelPrintPreview orderId={id.data} />;
}
