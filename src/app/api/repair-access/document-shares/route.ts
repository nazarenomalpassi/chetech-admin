import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DELIVERY_DOCUMENT_SELECT, readDocumentPayments } from "@/features/repairs-access/document-payments";
import { mapOrder } from "@/features/repairs-access/queries";
import { buildRepairDocumentData } from "@/features/repairs-access/documents";
import { generateRepairDocumentPdf } from "@/features/repairs-access/repair-document-pdf";
import { buildReceiptWhatsAppUrl, createDocumentToken, hashDocumentToken, documentShareHeaders, toSharedDocument } from "@/features/repairs-access/document-share";

export const runtime = "nodejs";
const inputSchema = z.object({orderId:z.string().uuid(),kind:z.enum(["intake","delivery"]),intent:z.enum(["send","revoke"])});
function error(message:string,status:number,json:boolean) {
  return json ? Response.json({error:message},{status,headers:documentShareHeaders})
    : new Response(`${message}\n\nCerrá esta pestaña y volvé a la ficha para revisar los datos o reintentar.`,{status,headers:{...documentShareHeaders,"Content-Type":"text/plain; charset=utf-8"}});
}

export async function POST(request:Request) {
  const requestUrl=new URL(request.url);
  const origin=`${requestUrl.protocol}//${request.headers.get("host")||requestUrl.host}`;
  const json=request.headers.get("content-type")?.includes("application/json")===true;
  if(request.headers.get("origin")!==origin)return error("Solicitud no autorizada.",403,json);
  try { if((await requireAdmin()).role!=="admin")return error("Solo administración puede compartir comprobantes.",403,json); }
  catch { return error("Iniciá sesión con la cuenta del local para compartir el comprobante.",403,json); }
  if(Number(request.headers.get("content-length")||0)>4096)return error("Solicitud demasiado grande.",413,json);
  let body:unknown;
  try { body=json?await request.json():Object.fromEntries(await request.formData()); }
  catch { return error("No se pudo leer la solicitud.",400,json); }
  const parsed=inputSchema.safeParse(body);
  if(!parsed.success)return error("Comprobante no válido.",400,json);
  const {orderId,kind,intent}=parsed.data;
  const client=await createServerSupabaseClient();
  if(intent==="revoke") {
    const result=await (client as any).rpc("revoke_repair_document_links",{p_order_id:orderId,p_kind:kind});
    if(result.error)return error("No se pudieron desactivar los enlaces. Intentá nuevamente.",503,json);
    return Response.json({revoked:result.data},{headers:documentShareHeaders});
  }
  const result=await (client as any).from("repair_access_orders").select(DELIVERY_DOCUMENT_SELECT).eq("id",orderId).maybeSingle();
  if(result.error)return error("No se pudieron consultar los datos del comprobante.",503,json);
  if(!result.data)return error("No se encontró la orden.",404,json);
  const order=mapOrder(result.data);
  if(kind==="delivery"&&!order.pickedUpAt&&!order.deliveredAt)return error("Registrá primero el retiro real del equipo.",409,json);
  const token=createDocumentToken();
  const link=new URL(`/api/comprobantes/${token}`,origin).toString();
  let target:string;
  try { target=buildReceiptWhatsAppUrl({phone:order.customer.phone,name:order.customer.fullName,number:order.repairNumber,kind,link}); }
  catch { return error("Revisá el teléfono del cliente antes de enviar el comprobante.",409,json); }
  let data:ReturnType<typeof buildRepairDocumentData>;
  try {
    data=toSharedDocument({...buildRepairDocumentData(order,kind,null,kind==="delivery"?readDocumentPayments(result.data):undefined),issuedAt:new Date().toISOString()});
  } catch { return error("Revisá los datos y cobros de la orden antes de emitir el comprobante.",409,json); }
  try { await generateRepairDocumentPdf(data); }
  catch { return error("No se pudo preparar el PDF. No se creó ningún enlace.",503,json); }
  const saved=await (client as any).rpc("issue_repair_document_link",{p_order_id:orderId,p_kind:kind,p_token_hash:hashDocumentToken(token),p_document:data});
  if(saved.error)return error(saved.error.code==="54000"?"Se prepararon muchos comprobantes. Esperá un minuto antes de reintentar.":"No se pudo proteger el comprobante. Intentá nuevamente.",503,json);
  return new Response(null,{status:303,headers:{...documentShareHeaders,Location:target}});
}
