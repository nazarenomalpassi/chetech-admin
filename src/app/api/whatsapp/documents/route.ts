import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await requireAdmin();
  const order = z.string().uuid().safeParse(new URL(request.url).searchParams.get("order"));
  if (!order.success) return Response.json({error:"Orden no válida."},{status:400});
  const client = await createServerSupabaseClient();
  const [jobs,state] = await Promise.all([
    (client as any).from("repair_document_deliveries").select("id,kind,status,error_code,created_at,accepted_at,delivered_at,read_at,submission_started_at,provider_message_id").eq("order_id",order.data).order("created_at"),
    (client as any).rpc("whatsapp_automation_status")
  ]);
  if (jobs.error || state.error) return Response.json({error:"No se pudo consultar el envío."},{status:503});
  return Response.json({jobs:jobs.data.map((job:any)=>({id:job.id,kind:job.kind,status:job.status,error_code:job.error_code,created_at:job.created_at,accepted_at:job.accepted_at,delivered_at:job.delivered_at,read_at:job.read_at,
    canRetry:["blocked","failed"].includes(job.status)&&!job.submission_started_at&&!job.provider_message_id})),enabled:state.data?.enabled===true},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request){
  await requireAdmin();
  if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Origen no autorizado."},{status:403});
  let body:unknown;
  try{body=await request.json();}catch{return Response.json({error:"Solicitud no válida."},{status:400});}
  const input=z.object({id:z.string().uuid()}).safeParse(body);
  if(!input.success)return Response.json({error:"No se pudo identificar el envío."},{status:400});
  const client=await createServerSupabaseClient();
  const result=await (client as any).rpc("whatsapp_recover_document",{p_id:input.data.id});
  if(result.error)return Response.json({error:result.error.code==="23514"?result.error.message:"No se pudo preparar el reintento."},{status:409});
  return Response.json({success:true},{headers:{"Cache-Control":"private, no-store"}});
}
