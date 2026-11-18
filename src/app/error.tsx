"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function RootError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-svh bg-background px-4 py-10 text-foreground">
      <section
        className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6"
        role="alert"
      >
        <p className="font-brand text-lg text-foreground">Chetech</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Ocurrió un error inesperado.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No se pudo completar la carga de esta pantalla. Intentá de nuevo o volvé al inicio.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-subtle-foreground">Código: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button className={buttonVariants()} onClick={reset} type="button">
            Intentar de nuevo
          </button>
          <Link className={buttonVariants({ variant: "secondary" })} href="/dashboard">
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}
