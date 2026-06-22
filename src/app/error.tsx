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
      <section className="mx-auto max-w-xl rounded-[32px] border border-black/10 bg-white p-6 shadow-[0_24px_58px_rgba(20,20,19,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Chetech</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Ocurrio un error inesperado.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          No se pudo completar la carga de esta pantalla. Intenta nuevamente o vuelve al panel principal.
        </p>
        {error.digest ? <p className="mt-3 text-xs text-slate-400">Codigo: {error.digest}</p> : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            className="rounded-full bg-[#1c1b19] px-5 py-3 text-sm font-semibold text-white"
            onClick={reset}
            type="button"
          >
            Intentar nuevamente
          </button>
          <Link className="rounded-full border border-black/10 px-5 py-3 text-center text-sm font-semibold" href="/dashboard">
            Volver al dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
