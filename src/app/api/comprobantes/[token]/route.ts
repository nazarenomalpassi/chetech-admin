import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey } from "@/lib/supabase/config";
import { documentShareHeaders, documentTokenPattern, sharedDocumentSchema } from "@/features/repairs-access/document-share";
import { generateRepairDocumentPdf } from "@/features/repairs-access/repair-document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const unavailable=()=>new Response("Este comprobante no está disponible. El enlace puede haber vencido o sido desactivado. Pedí uno nuevo a CHETECH: 3571 544683.",{status:404,headers:{...documentShareHeaders,"Content-Type":"text/plain; charset=utf-8"}});

export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!documentTokenPattern.test(token))return unavailable();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=getSupabasePublicKey();
  if(!url||!key)return new Response("El comprobante no se puede consultar en este momento. Intentá más tarde.",{status:503,headers:documentShareHeaders});
  // No admin cookie or service key: this client can resolve only the explicit bearer capability.
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let result;
  try { result=await client.rpc("read_repair_document_link",{p_token:token}); }
  catch { return new Response("No se pudo consultar el comprobante. Intentá más tarde.",{status:503,headers:documentShareHeaders}); }
  if(result.error)return new Response("No se pudo consultar el comprobante. Intentá más tarde.",{status:503,headers:documentShareHeaders});
  if(!result.data)return unavailable();
  const parsed=sharedDocumentSchema.safeParse(result.data.document);
  if(!parsed.success)return unavailable();
  const data=parsed.data;
  const suffix=data.kind==="intake"?"ingreso-de-equipo":"pago-y-garantia";
  let pdf:Buffer;
  try { pdf=await generateRepairDocumentPdf(data); }
  catch { return new Response("No se pudo generar el PDF. Intentá nuevamente más tarde.",{status:503,headers:documentShareHeaders}); }
  return new Response(new Uint8Array(pdf),{headers:{...documentShareHeaders,"Content-Type":"application/pdf","Content-Disposition":`inline; filename="CHETECH-${data.number.replace(/[^A-Za-z0-9-]/g,"")}-${suffix}.pdf"`}});
}

export async function HEAD(request:Request,context:{params:Promise<{token:string}>}) {
  const response=await GET(request,context);
  return new Response(null,{status:response.status,headers:response.headers});
}
