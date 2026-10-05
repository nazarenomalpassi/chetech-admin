"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import { createClientSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function WorkshopUpdates({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const dirty = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    let disposed = false;
    let lastRefresh = 0;
    let connected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      if (disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (dirty.current || disabledRef.current || document.documentElement.hasAttribute("data-unsaved-changes")) { setWaiting(true); return; }
      if (Date.now() - lastRefresh < 1500) return;
      lastRefresh = Date.now();
      setWaiting(false);
      router.refresh();
    }
    function edited(event: Event) {
      if (event.target instanceof Element && event.target.closest("form[data-workshop-form]")) dirty.current = true;
    }
    function saved() { dirty.current = false; setWaiting(false); }
    function connection() { setOffline(!navigator.onLine); if (navigator.onLine) refresh(); }
    function schedule() {
      if (disposed) return;
      timer = setTimeout(() => { if (!connected) refresh(); schedule(); }, 25000);
    }
    const channel = supabase.channel("workshop-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workshop_events" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { refresh(); schedule(); }, 400);
      })
      .subscribe((status) => { connected = status === "SUBSCRIBED"; });
    document.addEventListener("input", edited);
    document.addEventListener("change", edited);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("chetech:workshop-saved", saved);
    setOffline(!navigator.onLine);
    schedule();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
      document.removeEventListener("input", edited);
      document.removeEventListener("change", edited);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("chetech:workshop-saved", saved);
    };
  }, [router]);
  if (!waiting && !offline) return null;
  return <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm ${offline ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
    <span className="flex items-center gap-2">{offline ? <WifiOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}{offline ? "Sin conexion. Los cambios no estan guardados en el servidor hasta que recibas la confirmacion." : "Hay novedades en el taller. Tus cambios sin guardar se conservan."}</span>
    {waiting && !offline ? <Button type="button" variant="secondary" size="sm" onClick={() => { if (!dirty.current || window.confirm("Hay cambios sin guardar. ¿Querés actualizar la pantalla?")) { dirty.current = false; setWaiting(false); router.refresh(); } }}>Revisar novedades</Button> : null}
  </div>;
}
