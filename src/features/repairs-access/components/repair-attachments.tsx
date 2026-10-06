"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_REPAIR_IMAGE_BYTES } from "../attachments";

type Photo = { id: string; file_name: string; created_at: string };
export function RepairAttachments({ orderId }: { orderId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    fetch(`/api/repair-access/attachments?orderId=${orderId}`, { signal: controller.signal, cache: "no-store" }).then((r) => r.json()).then((r) => { if (r.files) setPhotos(r.files); else setMessage("No se pudieron consultar las fotos. Reintenta con conexion disponible."); }).catch(() => { if (!controller.signal.aborted) setMessage("No se pudieron consultar las fotos. Reintenta con conexion disponible."); });
    return () => controller.abort();
  }, [orderId, revision, opened]);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size > MAX_REPAIR_IMAGE_BYTES) {
      setMessage("Selecciona una foto JPG, PNG o WebP de hasta 4 MB."); return;
    }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/repair-access/attachments", { method: "POST", body: data });
      if (response.status === 413) throw new Error("La foto es demasiado grande. Usa una de hasta 4 MB.");
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("No se pudo confirmar el guardado. Revisa la conexion y tu sesion antes de reintentar.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo subir la foto.");
      setMessage("Foto guardada en la orden."); setRevision((v) => v+1); form.reset(); window.dispatchEvent(new Event("chetech:workshop-saved"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar. Reintenta con conexion."); }
    finally { setPending(false); }
  }
  return <details onToggle={(event) => setOpened(event.currentTarget.open)} className="rounded-2xl border border-slate-200 bg-white p-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><Camera className="h-4 w-4" />Fotos del equipo {opened ? `(${photos.length})` : ""}</summary><form data-workshop-form onSubmit={upload} className="mt-3 grid gap-3"><input name="orderId" value={orderId} type="hidden" /><label className="grid gap-2 text-xs text-slate-600">Foto del ingreso, falla o resultado<input name="file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required disabled={pending} className="block w-full min-w-0 rounded-xl border p-2 text-sm" /></label><Button type="submit" disabled={pending} variant="secondary">{pending ? "Subiendo..." : "Guardar foto privada"}</Button>{message ? <p role="status" className="text-xs text-slate-600">{message}</p> : null}</form><div className="mt-3 grid gap-2">{photos.map((p) => <a key={p.id} href={`/api/repair-access/attachments/${p.id}`} target="_blank" rel="noreferrer" className="min-h-11 rounded-xl bg-slate-50 p-3 text-sm underline underline-offset-4">{p.file_name}</a>)}</div></details>;
}
