"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function PwaRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [notice, setNotice] = useState("Hay una version nueva lista para instalar.");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );
      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(keys.filter((key) => key.startsWith("chetech-")).map((key) => caches.delete(key)))
        );
      }
      return;
    }

    let disposed = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (disposed) return;
        if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (!disposed && installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(installingWorker);
            }
          });
        });
      })
      .catch(() => {
        // PWA support is progressive: if registration fails, the web app keeps working normally.
      });

    return () => {
      disposed = true;
    };
  }, []);

  function installUpdate() {
    if (!waitingWorker) return;

    if (document.documentElement.hasAttribute("data-unsaved-changes")) {
      setNotice("Guarda o descarta los cambios pendientes antes de actualizar.");
      return;
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  if (!waitingWorker) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-pop sm:flex-row sm:items-center sm:justify-between"
      role="status"
    >
      <div>
        <p className="text-sm font-semibold text-slate-950">Actualizacion disponible</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">{notice}</p>
      </div>
      <Button className="shrink-0" onClick={installUpdate} type="button">
        Actualizar ahora
      </Button>
    </aside>
  );
}
