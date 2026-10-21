import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getWhatsAppConfig } from "./protocol";
import { verifyProvider } from "./provider";

export async function getWhatsAppSetupStatus() {
  const client = await createServerSupabaseClient();
  const state = await (client as any).rpc("whatsapp_automation_status");
  const enabled = !state.error && state.data?.enabled === true;
  const webhookVerified = !state.error && state.data?.webhookVerified === true;
  const config = getWhatsAppConfig();
  if (!config) return { enabled, connected: false, templatesApproved: false, webhookVerified, ready: false,
    message: "Falta vincular el WhatsApp Business del local a la plataforma de envíos." };
  try {
    await verifyProvider(config);
    return { enabled, connected: true, templatesApproved: true, webhookVerified, ready: webhookVerified && !state.error,
      message: enabled ? "Los nuevos ingresos y retiros con autorización del cliente se envían automáticamente." : webhookVerified ? "Conexión verificada. Ya podés activar los envíos." : "Falta confirmar la recepción de estados desde WhatsApp." };
  } catch {
    return { enabled, connected: false, templatesApproved: false, webhookVerified, ready: false,
      message: "La conexión o los dos mensajes de comprobantes todavía necesitan confirmación en Meta." };
  }
}
