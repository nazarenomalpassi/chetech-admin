"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmThen } from "@/components/ui/confirm-dialog";

export function WorkshopUpdates({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const dirty = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    let disposed = false;
    let removeChannel: (() => void) | undefined;
    let lastRefresh = 0;
    let connected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      if (disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (
        dirty.current ||
        disabledRef.current ||
        document.documentElement.hasAttribute("data-unsaved-changes")
      ) {
        setWaiting(true);
        return;
      }
      if (Date.now() - lastRefresh < 1500) return;
      lastRefresh = Date.now();
      setWaiting(false);
      router.refresh();
    }
    function edited(event: Event) {
      if (event.target instanceof Element && event.target.closest("form[data-workshop-form]"))
        dirty.current = true;
    }
    function saved() {
      dirty.current = false;
      setWaiting(false);
    }
    function connection() {
      setOffline(!navigator.onLine);
      if (navigator.onLine) refresh();
    }
    function schedule() {
      if (disposed) return;
      timer = setTimeout(() => {
        if (!connected) refresh();
        schedule();
      }, 25000);
    }
    // El cliente de Supabase del navegador pesa unos 50 kB: se descarga después de pintar la mesa.
    void import("@/lib/supabase/client").then(({ createClientSupabaseClient }) => {
      if (disposed) return;
      const supabase = createClientSupabaseClient();
      const channel = supabase
        .channel("workshop-updates")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "workshop_events" },
          () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              refresh();
              schedule();
            }, 400);
          }
        )
        .subscribe((status) => {
          connected = status === "SUBSCRIBED";
        });
      removeChannel = () => void supabase.removeChannel(channel);
    });
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
      removeChannel?.();
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
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${offline ? "border-warning-border bg-warning-soft text-warning" : "border-info-border bg-info-soft text-info"}`}
    >
      <span className="flex items-center gap-2">
        {offline ? <WifiOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        {offline
          ? "Sin conexion. Los cambios no estan guardados en el servidor hasta que recibas la confirmacion."
          : "Hay novedades en el taller. Tus cambios sin guardar se conservan."}
      </span>
      {waiting && !offline ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            const update = () => {
              dirty.current = false;
              setWaiting(false);
              router.refresh();
            };
            if (!dirty.current) return update();
            confirmThen(
              {
                title: "¿Actualizar la pantalla?",
                description: "Hay cambios sin guardar en un formulario del taller.",
                confirmLabel: "Actualizar"
              },
              update
            );
          }}
        >
          Revisar novedades
        </Button>
      ) : null}
    </div>
  );
}
