"use client";

import React, { useEffect, useId, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { fiscalInputFromSnapshot, IVA_CONDITIONS, type FiscalInput, type FiscalRecord } from "../model";
import type { FiscalPanelState, FiscalPreview } from "../service";

async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...(body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "No se pudo consultar el estado fiscal.");
  return data as T;
}
const environmentLabel = (environment: string) => environment === "production" ? "Produccion" : "Homologacion: sin validez fiscal";

export function FiscalInvoicePanel({ invoiceId, className, onIssued }: {
  invoiceId?: string; className?: string; onIssued?: (record: FiscalRecord) => void;
}) {
  const [state, setState] = useState<FiscalPanelState | null>(null);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FiscalPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialogId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const initialFields = useRef("");
  const endpoint = invoiceId ? `/api/fiscal/invoices/${invoiceId}` : "/api/fiscal/readiness";
  useEffect(() => {
    if (open && formRef.current) initialFields.current = JSON.stringify(Array.from(new FormData(formRef.current)));
  }, [open]);

  function requestClose() {
    if (pending) return;
    const form = formRef.current;
    if (form && JSON.stringify(Array.from(new FormData(form))) !== initialFields.current && !window.confirm("Cerrar sin emitir? Los cambios del formulario fiscal no se guardaron.")) return;
    setOpen(false);
  }

  useEffect(() => {
    let active = true;
    setState(null); setPreview(null); setOpen(false); setMessage("");
    void api<FiscalPanelState>(endpoint).then((next) => { if (active) setState(next); })
      .catch(() => { if (active) setMessage("No se pudo leer la configuracion fiscal. No hay emision automatica; recarga para consultar."); });
    return () => { active = false; };
  }, [endpoint]);

  const currentRecords = state?.records.filter((record) => record.snapshot.environment === state.readiness.environment) ?? [];
  const accepted = currentRecords.some((record) => record.status === "accepted");
  const active = currentRecords.find((record) => !["accepted", "rejected"].includes(record.status));
  const eligible = !state?.sourceType || ["sale", "repair", "repair_access"].includes(state.sourceType);

  function confirm() {
    if (!invoiceId || !preview || !consent || pending) return;
    startTransition(async () => {
      try {
        const record = await api<FiscalRecord>(`${endpoint}/confirm`, { confirm: true, requestId: preview.requestId,
          snapshotHash: preview.snapshotHash, environment: preview.snapshot.environment, input: fiscalInputFromSnapshot(preview.snapshot) });
        setState((old) => old ? { ...old, records: [record, ...old.records.filter((r) => r.id !== record.id)] } : old);
        setOpen(false); setConsent(false);
        if (record.status === "accepted") {
          setMessage("ARCA autorizo el comprobante con CAE. Caja y stock no fueron modificados."); setPreview(null); onIssued?.(record);
        } else if (record.status === "rejected") {
          setMessage(`No hay CAE autorizado. Revisa los datos antes de una nueva vista previa.${record.errorCodes.length ? ` Codigos ARCA: ${record.errorCodes.join(", ")}.` : " Verifica certificado, habilitacion y disponibilidad del servicio."}`); setPreview(null);
        } else setMessage("Resultado pendiente o incierto. La serie permanece reservada. Espera al menos dos minutos y usa Consultar y recuperar; no emitas por otro sistema en ese PV.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Respuesta incierta. Consulta antes de reintentar.");
        // Read-only refresh, never an automatic authorization retry.
        try { setState(await api<FiscalPanelState>(endpoint)); } catch { /* The durable request id remains available in this preview. */ }
      }
    });
  }

  return <Card className={className}><section aria-label="Facturacion fiscal ARCA">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="text-lg font-semibold text-graphite">{invoiceId ? "Factura C (ARCA)" : "Estado fiscal (ARCA)"}</h2>
      <span className="text-sm font-medium text-slate-600">{state ? environmentLabel(state.readiness.environment) : "Consultando configuracion"}</span>
    </div>
    <p className="mt-2 max-w-[75ch] text-sm leading-6 text-slate-600">Solo se emite con vista previa y confirmacion manual. No registra cobros ni mueve stock. Una factura fiscal requiere CAE autorizado por ARCA.</p>
    {!invoiceId ? <p className="mt-2 text-sm text-slate-600">La emision se inicia desde un comprobante interno vinculado a una venta o reparacion.</p> : null}
    {state ? <div className="mt-4 space-y-3">
      <p className="text-sm"><strong>CUIT {state.readiness.issuerCuit || "sin configurar"}</strong> | Responsable Monotributo | Tipo 11 (C) | PV {state.readiness.pointOfSale ? String(state.readiness.pointOfSale).padStart(5, "0") : "sin configurar"}</p>
      {state.readiness.ready ? <p className="text-sm text-slate-700">Configuracion local validada. La habilitacion de CUIT, PV y receptor se verifica con ARCA al confirmar.</p>
        : <div className="border-l-2 border-graphite/35 pl-4"><p className="font-semibold">Integracion pendiente: todavia no puede emitir</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">{state.readiness.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          <p className="mt-3 text-sm">Produccion: PV00001 queda bloqueado para esta instalacion. Homologacion: cualquier PV exige configuracion explicita y habilitacion WS verificada. No se solicita ni almacena Clave Fiscal.</p></div>}
      {!eligible ? <p className="text-sm">Selecciona un comprobante interno vinculado a una venta o reparacion.</p> : null}
      {accepted ? <p className="text-sm">Esta operacion ya tiene una factura C autorizada en este entorno.</p> : active ? <p className="text-sm">Hay una emision pendiente. Consulta y recupera el resultado antes de volver a emitir.</p> : null}
    </div> : null}
    {invoiceId ? <div className="mt-5 flex flex-wrap gap-3">
      <Button disabled={!state?.readiness.ready || !eligible || accepted || !!active || pending} onClick={() => { setPreview(null); setConsent(false); setOpen(true); }}>Emitir factura C manualmente</Button>
      {active || preview ? <Button variant="secondary" disabled={pending || !state?.readiness.ready} onClick={() => {
        if (active) setPreview({ requestId: active.id, snapshotHash: active.snapshotHash, snapshot: active.snapshot });
        setConsent(false); setOpen(true);
      }}>Consultar y recuperar</Button> : null}
    </div> : null}
    {message ? <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-graphite/15 bg-white p-3 text-sm leading-6">{message}</p> : null}
    {state?.records.length ? <div className="mt-5 divide-y divide-graphite/10 border-t border-graphite/10">{state.records.map((record) => <article key={record.id} className="py-4">
      <p className="text-sm font-medium text-slate-600">{environmentLabel(record.snapshot.environment)}</p>
      <p className="mt-2 font-semibold">{record.status === "accepted" ? `Factura C ${String(record.snapshot.pointOfSale).padStart(5, "0")}-${String(record.number).padStart(8, "0")}` : record.status === "rejected" ? "Intento rechazado / no autorizado" : "Emision pendiente: reserva conservada"}</p>
      <p className="mt-1 text-sm">{formatCurrency(record.snapshot.totalCents / 100)} | {record.snapshot.receiver.name} | {record.snapshot.issuedOn}</p>
      {record.status === "accepted" && record.authorization ? <div className="mt-4 flex flex-wrap items-center gap-4">
        <Image alt="QR de la factura autorizada por ARCA" width={96} height={96} unoptimized src={`/api/fiscal/records/${record.id}/qr`} />
        <div className="space-y-2 text-sm"><p>CAE: {record.authorization.cae}</p><p>Vencimiento CAE: {record.authorization.expiresOn}</p>
          <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={`/api/fiscal/records/${record.id}/pdf`}>Descargar PDF autorizado</a>
          {record.authorization.observationCodes.length ? <p>Observaciones ARCA: {record.authorization.observationCodes.join(", ")}</p> : null}</div>
      </div> : <p className="mt-2 text-sm text-slate-600">Sin CAE confirmado: no hay PDF ni QR fiscal.{record.errorCodes.length ? ` Codigos ARCA: ${record.errorCodes.join(", ")}.` : ""}</p>}
    </article>)}</div> : null}
    {open && state && invoiceId ? <DialogShell labelledBy={dialogId} onClose={requestClose} panelClassName="max-w-3xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-slate-600">{environmentLabel(state.readiness.environment)}</p>
        <h3 id={dialogId} className="mt-2 text-xl font-semibold">{preview ? "Revisar y confirmar factura C" : "Datos fiscales de esta operacion"}</h3></div>
        <Button variant="ghost" disabled={pending} onClick={requestClose} aria-label="Cerrar dialogo fiscal">Cerrar</Button></div>
      {preview ? <div className="mt-5 space-y-4">
        <p className="text-sm leading-6">Esta confirmacion solicita una autorizacion real al entorno indicado. En produccion es irreversible: no elimina ni anula el comprobante. Una nota de credito debe gestionarse por separado.</p>
        <dl className="grid gap-4 border-y border-graphite/10 py-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-600">Emisor / CUIT / PV</dt><dd className="font-semibold">{preview.snapshot.issuer.name} / {preview.snapshot.issuer.cuit} / {String(preview.snapshot.pointOfSale).padStart(5, "0")}</dd></div>
          <div><dt className="text-slate-600">Receptor / documento</dt><dd className="font-semibold">{preview.snapshot.receiver.name} / {preview.snapshot.receiver.documentNumber}</dd><dd>{preview.snapshot.receiver.address}</dd></div>
          <div><dt className="text-slate-600">Concepto / condicion IVA</dt><dd>{preview.snapshot.concept === 1 ? "Productos" : preview.snapshot.concept === 2 ? "Servicios" : "Productos y servicios"} / {IVA_CONDITIONS.find(([id]) => id === preview.snapshot.receiver.ivaCondition)?.[1]}</dd></div>
          <div><dt className="text-slate-600">Fecha / periodo / vencimiento</dt><dd>{preview.snapshot.issuedOn}</dd>{preview.snapshot.concept !== 1 ? <dd>{preview.snapshot.serviceFrom} al {preview.snapshot.serviceTo} / {preview.snapshot.paymentDue}</dd> : null}</div>
        </dl>
        <ul className="divide-y divide-graphite/10 text-sm">{preview.snapshot.items.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-3"><span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.quantity} x {item.description}</span><strong>{formatCurrency(item.totalCents / 100)}</strong></li>)}</ul>
        <p className="text-sm">Descuento: {formatCurrency(preview.snapshot.discountCents / 100)} | IVA no discriminado</p>
        <p className="text-2xl font-semibold">Total: {formatCurrency(preview.snapshot.totalCents / 100)}</p>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-graphite/15 bg-white p-4 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-graphite" checked={consent} disabled={pending} onChange={(event) => setConsent(event.target.checked)} />Confirmo la emision manual de esta factura C</label>
        <Button className="w-full sm:w-auto" disabled={!consent || pending} onClick={confirm}>{pending ? "Consultando ARCA..." : state.readiness.environment === "production" ? "Confirmar emision en produccion" : "Confirmar emision en homologacion"}</Button>
      </div> : <form ref={formRef} className="mt-5 space-y-4" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const concept = Number(form.get("concept")) as FiscalInput["concept"];
        const body = { concept, issuedOn: state.readiness.today,
          ...(concept === 1 ? {} : { serviceFrom: String(form.get("serviceFrom")), serviceTo: String(form.get("serviceTo")), paymentDue: String(form.get("paymentDue")) }),
          receiver: { name: String(form.get("name")), address: String(form.get("address")), documentType: Number(form.get("documentType")), documentNumber: String(form.get("documentNumber")), ivaCondition: Number(form.get("ivaCondition")) } };
        startTransition(async () => { try { setPreview(await api<FiscalPreview>(`${endpoint}/preview`, body)); setConsent(false); setMessage(""); }
          catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo preparar la vista previa."); } });
      }}>
        <FiscalFields customerName={state.customerName ?? ""} today={state.readiness.today} pending={pending} sourceType={state.sourceType} />
        <p className="text-sm leading-6 text-slate-600">La vista previa no envia comprobantes a ARCA. El total se toma del documento interno guardado, no del formulario.</p>
        <Button type="submit" disabled={pending}>{pending ? "Preparando..." : "Revisar factura C"}</Button>
      </form>}
      {message ? <p className="mt-4 text-sm" role="alert">{message}</p> : null}
    </DialogShell> : null}
  </section></Card>;
}

function FiscalFields({ customerName, today, pending, sourceType }: { customerName: string; today: string; pending: boolean; sourceType?: string }) {
  const [concept, setConcept] = useState("");
  const selectClass = "h-11 min-w-0 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-graphite outline-none focus:border-graphite focus:ring-2 focus:ring-graphite/15 disabled:bg-brand-50 sm:text-sm";
  return <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
    <label className="grid gap-2 text-sm">Concepto fiscal<select className={selectClass} name="concept" required value={concept} onChange={(e) => setConcept(e.target.value)}><option value="">Seleccionar expresamente</option><option value="1" disabled={sourceType === "repair_access"}>Productos</option><option value="2">Servicios</option><option value="3" disabled={sourceType === "repair_access"}>Productos y servicios</option></select></label>
    <label className="grid gap-2 text-sm">Fecha de emision (Argentina)<Input value={today} readOnly type="date" /></label>
    <label className="grid gap-2 text-sm">Nombre o razon social del receptor<Input name="name" required maxLength={500} defaultValue={customerName} /></label>
    <label className="grid gap-2 text-sm">Domicilio del receptor<Input name="address" required maxLength={500} /></label>
    <label className="grid gap-2 text-sm">Tipo de documento<select className={selectClass} name="documentType" defaultValue="96"><option value="96">DNI (Consumidor Final)</option><option value="80">CUIT</option></select></label>
    <label className="grid gap-2 text-sm">Numero de documento<Input name="documentNumber" inputMode="numeric" pattern="[0-9]{7,11}" required maxLength={11} /></label>
    <label className="grid gap-2 text-sm sm:col-span-2">Condicion frente al IVA<select className={selectClass} name="ivaCondition" required defaultValue=""><option value="">Seleccionar expresamente</option>{IVA_CONDITIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {concept && concept !== "1" ? <><label className="grid gap-2 text-sm">Servicio desde<Input name="serviceFrom" required type="date" /></label><label className="grid gap-2 text-sm">Servicio hasta<Input name="serviceTo" required type="date" /></label><label className="grid gap-2 text-sm">Vencimiento de pago<Input name="paymentDue" required min={today} type="date" /></label></> : null}
  </fieldset>;
}
