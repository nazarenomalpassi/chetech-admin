"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getWhatsAppConfig } from "./protocol";
import { getWhatsAppSetupStatus } from "./setup";
import { createWhatsAppServiceClient } from "./runtime";

export async function toggleWhatsAppAutomation(form: FormData) {
  await requireAdmin();
  const enable = form.get("enable") === "true";
  const config = getWhatsAppConfig();
  if (!config && enable) redirect(`/configuracion?error=${encodeURIComponent("Primero hay que conectar el WhatsApp Business del local.")}`);
  if (enable) {
    const setup = await getWhatsAppSetupStatus();
    if (!setup.ready) redirect(`/configuracion?error=${encodeURIComponent(setup.message)}`);
  }
  let failure = false;
  try {
    const client = createWhatsAppServiceClient();
    if (enable && config) {
      const scheduler = await client.rpc("whatsapp_configure_worker", { p_token: config.workerSecret });
      if (scheduler.error) throw new Error();
    }
    const result = await client.rpc("whatsapp_set_automation", { p_enabled: enable });
    if (result.error) throw new Error();
  } catch { failure = true; }
  if (failure) redirect(`/configuracion?error=${encodeURIComponent("No se pudo actualizar la conexión de WhatsApp. Revisá la configuración antes de reintentar.")}`);
  revalidatePath("/configuracion");
  redirect("/configuracion");
}
