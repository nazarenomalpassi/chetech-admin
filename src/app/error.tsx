"use client";

import Link from "next/link";

export default function RootError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-svh bg-[#f7f7f4] px-4 py-10 text-[#1c1b19]">
      <section
        className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6"
        role="alert"
      >
        <p className="font-brand text-lg text-foreground">Chetech</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Ocurrio un error inesperado.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No se pudo completar la carga de esta pantalla. Intenta nuevamente o vuelve al panel
          principal.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-subtle-foreground">Código: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            className="min-h-11 rounded-lg bg-[#1c1b19] px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid"
            onClick={reset}
            type="button"
          >
            Intentar nuevamente
          </button>
          <Link
            className="min-h-11 rounded-lg border border-border px-5 py-3 text-center text-sm font-semibold"
            href="/dashboard"
          >
            Volver al dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
