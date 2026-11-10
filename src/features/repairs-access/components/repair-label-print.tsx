"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function RepairLabelPrintLink({ orderId, reprint = false }: { orderId: string; reprint?: boolean }) {
  return <a className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}
    href={`/reparaciones-access/etiqueta/${encodeURIComponent(orderId)}`} target="_blank" rel="noopener noreferrer">
    <Printer className="h-4 w-4" aria-hidden="true" />
    {reprint ? "Reimprimir etiqueta" : "Imprimir etiqueta"}
  </a>;
}

export function RepairLabelPrintPreview({ orderId }: { orderId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const attempted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retry, setRetry] = useState(0);
  const [pdf, setPdf] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [printHelp, setPrintHelp] = useState("");
  const endpoint = `/api/repair-access/labels/${encodeURIComponent(orderId)}`;

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    attempted.current = false;
    setPdf(null);
    setError("");
    setPrintHelp("");
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("Content-Type")?.includes("application/pdf")) throw new Error("label unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPdf(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError("No se pudo cargar la etiqueta. Revisa tu sesion y conexion. La orden sigue guardada.");
      }
    }
    void load();
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, retry]);

  function printLabel() {
    attempted.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    try {
      const target = frame.current?.contentWindow;
      if (!target) throw new Error("Preview not ready");
      target.focus();
      target.print();
      setPrintHelp("Confirma la impresora en la ventana de impresion. Si no se abre, usa Abrir PDF.");
    } catch {
      setPrintHelp("Este navegador no permite imprimir desde la vista previa. Usa Abrir PDF e imprime desde su visor.");
    }
  }

  function previewLoaded() {
    if (attempted.current) return;
    attempted.current = true;
    // Let the native PDF viewer finish initializing before requesting its dialog.
    timer.current = setTimeout(printLabel, 350);
  }

  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 px-4 py-6 sm:px-6">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">CHETECH / Taller</p>
      <h1 className="text-2xl font-semibold text-graphite">Etiqueta de la orden</h1>
      <p className="text-sm leading-6 text-slate-600">Selecciona papel de <strong>80 x 50 mm</strong>, escala <strong>100%</strong>, sin ajustar a pagina. Confirma la salida en la impresora.</p>
    </header>
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={printLabel} disabled={!pdf}><Printer className="h-4 w-4" aria-hidden="true" />Imprimir etiqueta</Button>
      <a href={endpoint} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary" })}>Abrir PDF</a>
      <a href={`/reparaciones-access?view=detalle&order=${encodeURIComponent(orderId)}`} className={buttonVariants({ variant: "ghost" })}>Volver a la orden</a>
    </div>
    {error ? <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p>{error}</p><Button type="button" variant="secondary" onClick={() => setRetry(value => value + 1)}>Reintentar</Button>
    </div> : pdf ? <iframe ref={frame} src={pdf} title="Vista previa de la etiqueta de taller" onLoad={previewLoaded}
      className="h-[min(65dvh,540px)] min-h-72 w-full rounded-xl border border-line bg-white" /> : <p role="status" className="py-12 text-sm text-slate-600">Preparando etiqueta...</p>}
    {printHelp ? <p role="status" className="text-sm text-slate-600">{printHelp}</p> : null}
    <p className="text-xs leading-5 text-slate-500">Imprimir o reimprimir no crea otra orden ni cambia su numero. Usa los datos ya guardados. La vista previa no confirma que la impresora haya terminado.</p>
  </main>;
}
