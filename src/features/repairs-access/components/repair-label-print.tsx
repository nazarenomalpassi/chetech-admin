"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function RepairLabelPrintLink({ orderId, reprint = false }: { orderId: string; reprint?: boolean }) {
  return <a className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}
    href={`/reparaciones-access/etiqueta/${encodeURIComponent(orderId)}`} target="_blank" rel="noopener noreferrer">
    <Printer className="h-4 w-4" aria-hidden="true" />
    {reprint ? "Reimprimir etiqueta" : "Imprimir etiqueta"}
  </a>;
}

export function RepairLabelPrintPreview({ orderId }: { orderId: string }) {
  const fieldId = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [retry, setRetry] = useState(0);
  const [pdf, setPdf] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [printHelp, setPrintHelp] = useState("");
  const [variant, setVariant] = useState("equipment");
  const [accessoryDescription, setAccessoryDescription] = useState("");
  const [accessoryIndex, setAccessoryIndex] = useState("1");
  const [accessoryRequest, setAccessoryRequest] = useState<string | null>(null);
  const [accessoryDescriptionTruncated, setAccessoryDescriptionTruncated] = useState(false);
  const endpoint = `/api/repair-access/labels/${encodeURIComponent(orderId)}`;
  const payload = variant === "equipment" ? "" : variant === "warranty" ? '{"variant":"warranty"}' : accessoryRequest;
  const fallback = variant === "equipment" ? "Abrir PDF" : "Descargar PDF";

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setPdf(null);
    setAccessoryDescriptionTruncated(false);
    setError("");
    setPrintHelp("");
    async function load() {
      if (payload === null) return;
      let message = "No se pudo cargar la etiqueta. Revisa tu sesion y conexion. La orden sigue guardada.";
      try {
        const response = await fetch(endpoint, {
          cache: "no-store", signal: controller.signal,
          ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: payload } : {})
        });
        if (!response.ok && response.headers.get("Content-Type")?.includes("application/json")) {
          const body = await response.json();
          if (typeof body.error === "string" && body.error.length <= 300) message = body.error;
        }
        if (!response.ok || !response.headers.get("Content-Type")?.includes("application/pdf")) throw new Error("label unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setAccessoryDescriptionTruncated(response.headers.get("X-CHETECH-Accessory-Truncated") === "1");
        setPdf(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError(message);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint, retry, payload]);

  function printLabel() {
    try {
      const target = frame.current?.contentWindow;
      if (!target) throw new Error("Preview not ready");
      target.focus();
      target.print();
      setPrintHelp(`Confirma la impresora en la ventana de impresion. Si no se abre, usa ${fallback}.`);
    } catch {
      setPrintHelp(`Este navegador no permite imprimir desde la vista previa. Usa ${fallback} e imprime desde su visor.`);
    }
  }

  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 px-4 py-6 sm:px-6">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">CHETECH / Taller</p>
      <h1 className="text-2xl font-semibold text-graphite">Etiqueta de la orden</h1>
      <p className="text-sm leading-6 text-slate-600">Selecciona papel de <strong>80 x 50 mm</strong>, escala <strong>100%</strong>, sin ajustar a pagina. Confirma la salida en la impresora.</p>
      <p className="text-sm leading-6 text-slate-600">Revisa el tipo y la vista previa. Solo se imprime cuando tocas Imprimir etiqueta.</p>
    </header>
    <section aria-label="Opciones de etiqueta" className="space-y-4 rounded-xl border border-line bg-white p-4">
      <div className="space-y-1.5">
        <label htmlFor={`${fieldId}-variant`} className="text-sm font-medium text-graphite">Tipo de etiqueta</label>
        <Select id={`${fieldId}-variant`} value={variant} options={[
          { value: "equipment", label: "Equipo" }, { value: "accessory", label: "Accesorio" }, { value: "warranty", label: "Reingreso de garantia" }
        ]} onChange={event => { setVariant(event.target.value); setAccessoryRequest(null); }} />
      </div>
      {variant === "accessory" ? <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const index = Number(accessoryIndex), description = accessoryDescription.trim();
        if (!description || description.length > 120 || !Number.isInteger(index) || index < 1 || index > 99) return;
        setAccessoryRequest(JSON.stringify({ variant: "accessory", accessoryDescription: description, accessoryIndex: index }));
      }}>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-1.5">
            <label htmlFor={`${fieldId}-description`} className="text-sm font-medium text-graphite">Descripcion del accesorio</label>
            <Input id={`${fieldId}-description`} required maxLength={120} value={accessoryDescription} placeholder="Ej.: control remoto negro" onChange={event => { setAccessoryDescription(event.target.value); setAccessoryRequest(null); }} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${fieldId}-index`} className="text-sm font-medium text-graphite">Numero de accesorio</label>
            <Input id={`${fieldId}-index`} type="number" required min={1} max={99} step={1} value={accessoryIndex} onChange={event => { setAccessoryIndex(event.target.value); setAccessoryRequest(null); }} />
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-500">A1, A2, etc. identifican accesorios de la misma REP; no son nuevas ordenes. Usa una descripcion breve (maximo 120 caracteres) y revisa que entre en la etiqueta. Este texto solo se usa para imprimir y no se guarda en la ficha.</p>
        <Button type="submit" variant="secondary">Preparar etiqueta de accesorio</Button>
      </form> : variant === "warranty" ? <p className="text-sm leading-6 text-slate-600">Usa la falla, la fecha y los accesorios del reingreso activo. Conserva la REP y el QR de la ficha original.</p>
        : <p className="text-sm leading-6 text-slate-600">Usa la falla y los datos guardados en el ingreso original.</p>}
    </section>
    {variant === "accessory" && accessoryDescriptionTruncated ? <p role="note" aria-label="Descripcion del accesorio recortada" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
      Descripcion recortada: acorta el texto y prepara la etiqueta de nuevo para que se lea completo. El QR no recupera este texto temporal.
    </p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={printLabel} disabled={!pdf}><Printer className="h-4 w-4" aria-hidden="true" />Imprimir etiqueta</Button>
      {variant === "equipment" ? <a href={endpoint} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary" })}>Abrir PDF</a>
        : pdf ? <a href={pdf} download={`CHETECH-${variant === "accessory" ? `accesorio-A${Number(accessoryIndex)}` : "reingreso-garantia"}-80x50.pdf`} className={buttonVariants({ variant: "secondary" })}>Descargar PDF</a>
          : <Button type="button" variant="secondary" disabled>Descargar PDF</Button>}
      <a href={`/reparaciones-access?view=detalle&order=${encodeURIComponent(orderId)}`} className={buttonVariants({ variant: "ghost" })}>Volver a la orden</a>
    </div>
    {error ? <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p>{error}</p><Button type="button" variant="secondary" onClick={() => setRetry(value => value + 1)}>Reintentar</Button>
    </div> : pdf ? <iframe key={pdf} ref={frame} src={pdf} title="Vista previa de la etiqueta de taller"
      className="h-[min(65dvh,540px)] min-h-72 w-full rounded-xl border border-line bg-white" /> : <p role="status" className="py-12 text-sm text-slate-600">{payload === null ? "Completa el accesorio y prepara su etiqueta." : "Preparando etiqueta..."}</p>}
    {printHelp ? <p role="status" className="text-sm text-slate-600">{printHelp}</p> : null}
    <p className="text-xs leading-5 text-slate-500">Imprimir o reimprimir no crea otra orden ni cambia su numero, cobros o historial. El QR abre la misma ficha privada. La vista previa no confirma que la impresora haya terminado.</p>
  </main>;
}
