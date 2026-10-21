"use client";
import { useEffect,useRef,useState } from "react";
import { formatDate } from "@/lib/utils";
const labels: Record<string,string> = {pending:"En cola",processing:"Preparando PDF",submitting:"Confirmando envío",retry:"Se reintentará automáticamente",accepted:"Aceptado por WhatsApp",delivered:"Entregado",read:"Leído",blocked:"Requiere atención",failed:"No se pudo entregar",uncertain:"Pendiente de confirmar; no se reenviará automáticamente",cancelled:"Envío cancelado"};
type State = {enabled:boolean;jobs:Array<{id:string;kind:string;status:string;error_code:string|null;delivered_at:string|null;accepted_at:string|null;read_at:string|null;canRetry:boolean}>};
export function DocumentDeliveryStatus({orderId,consent}:{orderId:string;consent:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(false);
  const [busyJob,setBusyJob]=useState<string|null>(null),[retryMessage,setRetryMessage]=useState("");
  async function retry(id:string){
    if(busyJob)return;
    setBusyJob(id);setRetryMessage("");
    try{
      const response=await fetch("/api/whatsapp/documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"No se pudo preparar el reintento.");
      setRetryMessage("Documento preparado con los datos y la autorización actuales.");window.dispatchEvent(new Event("chetech:workshop-saved"));
    }catch(error){setRetryMessage(error instanceof Error?error.message:"No se pudo preparar el reintento.");}
    finally{setBusyJob(null);}
  }
  useEffect(()=>{
    const disclosure=root.current?.closest("details"); if(!disclosure) return;
    let controller:AbortController|null=null;
    const load=async()=>{
      if(!disclosure.open)return;
      controller?.abort();controller=new AbortController();const active=controller;setError(false);
      try {const response=await fetch(`/api/whatsapp/documents?order=${orderId}`,{signal:active.signal,cache:"no-store"}); if(!response.ok)throw new Error();const result=await response.json();if(!active.signal.aborted)setState(result);}
      catch{if(!active.signal.aborted)setError(true);}
    };
    disclosure.addEventListener("toggle",load);window.addEventListener("chetech:workshop-saved",load);
    void load();
    return ()=>{controller?.abort();disclosure.removeEventListener("toggle",load);window.removeEventListener("chetech:workshop-saved",load);};
  },[orderId]);
  return <div ref={root} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" aria-live="polite">
    <p className="font-medium text-slate-800">Automatización con API (opcional)</p>
    {error?<p className="mt-1 text-amber-800">No se pudo consultar el estado del envío.</p>:state?<>
      {!state.enabled?<p className="mt-1 text-slate-600">La API está desactivada. Podés usar los botones de WhatsApp Web para enviar manualmente un enlace protegido, sin cargos de API.</p>:!consent?<p className="mt-1 text-slate-600">Registrá en Editar ingreso si el cliente acepta recibir los comprobantes por WhatsApp.</p>:null}
      {state.jobs.map(job=><div key={job.id} className="mt-2 flex flex-wrap items-center justify-between gap-2"><span>{job.kind==="intake"?"Ingreso de equipo":"Pago y garantía"}</span><span className={["read","delivered"].includes(job.status)?"text-emerald-700":"text-slate-600"}>{labels[job.status]||"Estado pendiente"}{job.error_code==="invalid_phone"?" · Revisá el teléfono":null}{job.delivered_at?` · ${formatDate(new Date(job.delivered_at))}`:""}</span>
        {state.enabled&&job.canRetry?<button className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium disabled:opacity-50" type="button" disabled={busyJob!==null} onClick={()=>void retry(job.id)}>{busyJob===job.id?"Preparando...":"Revisar datos y reintentar"}</button>:null}
      </div>)}
      {retryMessage?<p role="status" className="mt-2 text-slate-700">{retryMessage}</p>:null}
      {state.enabled&&consent&&!state.jobs.length?<p className="mt-1 text-slate-600">No hay envíos registrados. Los comprobantes anteriores a la activación no se envían de forma retroactiva.</p>:null}
    </>:<p className="mt-1 text-slate-500">Consultando estado...</p>}
  </div>;
}
